import { randomUUID } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { DOTA_PARTY_VERTICAL } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { PrismaService } from "../../../database/prisma.service.js";
import type { PartyChatPingDto, PartyChatPingDelivery, PartyChatPingPayload } from "../dto/party-chat-ping.dto.js";
import { GamePartiesRepository } from "../repositories/game-parties.repository.js";

const COOLDOWN_MS = 5 * 60_000;
const includeMembers = {
  members: { include: { user: { select: {
    displayName: true, status: true,
    authIdentities: { where: { provider: "telegram" }, select: { providerUserId: true }, take: 1 }
  } } } }
} satisfies Prisma.GamePartyInclude;

@Injectable()
export class PartyChatPingsService {
  constructor(private readonly prisma: PrismaService, private readonly parties: GamePartiesRepository) {}

  async create(slug: string, userId: string, input: PartyChatPingDto): Promise<{ queued: true }> {
    const canonical = await this.parties.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);
    if (!canonical || canonical.id !== input.partyId) this.stale();
    return this.prisma.$transaction(async (tx) => {
      // Stable lock order serializes all senders for a recipient and concurrent removals.
      await tx.$queryRaw`SELECT "id" FROM "social"."game_party_members"
        WHERE "party_id" = ${input.partyId}::uuid
        AND "id" IN (${input.membershipId}::uuid, ${input.targetMembershipId}::uuid)
        ORDER BY "id" FOR UPDATE`;
      const party = await tx.gameParty.findUnique({ where: { id: input.partyId }, include: includeMembers });
      const now = Date.now();
      if (!party || party.kind !== "PARTY" || party.mergedIntoSlug || !party.expiresAt || party.expiresAt.getTime() <= now) this.stale();
      const sender = party.members.find(member => member.id === input.membershipId && member.userId === userId);
      const target = party.members.find(member => member.id === input.targetMembershipId);
      if (!sender || !target || target.userId === userId || sender.user.status !== "active") this.stale();
      if (sender.user.authIdentities[0]?.providerUserId !== input.telegramUserId) {
        throw createAppException({ code: AppErrorCode.Forbidden, message: "Telegram больше не связан с этим аккаунтом FDP.", statusCode: HttpStatus.FORBIDDEN });
      }
      const telegramId = target.user.authIdentities[0]?.providerUserId;
      if (target.user.status !== "active" || !telegramId || !/^\d{1,20}$/.test(telegramId) ||
          !await tx.telegramBotStart.findUnique({ where: { telegramUserId: telegramId }, select: { telegramUserId: true } })) {
        throw createAppException({ code: AppErrorCode.ValidationError, message: "Этот игрок ещё не подключил бота FDP.", statusCode: HttpStatus.BAD_REQUEST });
      }
      const prefix = `party-chat-ping:${party.id}:${target.userId}:`;
      const recent = await tx.telegramBotNotification.findFirst({
        where: { telegramUserId: telegramId, eventKey: { startsWith: prefix }, createdAt: { gt: new Date(now - COOLDOWN_MS) } },
        orderBy: { createdAt: "desc" }, select: { createdAt: true }
      });
      if (recent) {
        const seconds = Math.max(1, Math.ceil((recent.createdAt.getTime() + COOLDOWN_MS - now) / 1000));
        throw createAppException({ code: AppErrorCode.TooManyRequests,
          message: `Игрока уже позвали. Повторить можно через ${Math.ceil(seconds / 60)} мин.`,
          details: { retryAfterSeconds: seconds }, statusCode: HttpStatus.TOO_MANY_REQUESTS });
      }
      const payload: PartyChatPingPayload = {
        type: "party_chat_ping", partyId: party.id, partySlug: party.slug,
        senderUserId: userId, senderTelegramUserId: input.telegramUserId, senderMembershipId: sender.id,
        targetUserId: target.userId, targetMembershipId: target.id,
        expiresAt: new Date(Math.min(now + COOLDOWN_MS, party.expiresAt.getTime())).toISOString()
      };
      await tx.telegramBotNotification.create({ data: {
        telegramUserId: telegramId, eventKey: prefix + randomUUID(), payload: payload as unknown as Prisma.InputJsonValue,
        createdAt: new Date(now)
      } });
      return { queued: true as const };
    });
  }

  async delivery(slug: string, id: string, userId: string): Promise<PartyChatPingDelivery | null> {
    const notice = await this.prisma.telegramBotNotification.findUnique({ where: { id } });
    if (!notice || notice.deliveredAt) return null;
    if (!notice.payload || typeof notice.payload !== "object" || Array.isArray(notice.payload)) return null;
    const payload = notice.payload as unknown as PartyChatPingPayload;
    if (payload.type !== "party_chat_ping" || payload.targetUserId !== userId || payload.partySlug !== slug ||
        !Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) <= Date.now()) return null;
    const party = await this.prisma.gameParty.findUnique({ where: { id: payload.partyId }, include: includeMembers });
    if (!party || party.kind !== "PARTY" || party.mergedIntoSlug || !party.expiresAt || party.expiresAt.getTime() <= Date.now()) return null;
    const sender = party.members.find(member => member.id === payload.senderMembershipId && member.userId === payload.senderUserId);
    const target = party.members.find(member => member.id === payload.targetMembershipId && member.userId === userId);
    if (!sender || !target || sender.user.status !== "active" || target.user.status !== "active" ||
        sender.user.authIdentities[0]?.providerUserId !== payload.senderTelegramUserId ||
        target.user.authIdentities[0]?.providerUserId !== notice.telegramUserId) return null;
    return { senderName: sender.user.displayName, partyName: party.name, partyId: party.id, partySlug: party.slug, expiresAt: payload.expiresAt };
  }

  private stale(): never {
    throw createAppException({ code: AppErrorCode.Conflict, message: "Состав пати изменился. Открой карточку игрока заново.", statusCode: HttpStatus.CONFLICT });
  }
}
