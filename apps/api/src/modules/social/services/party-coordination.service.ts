import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { DOTA_PARTY_VERTICAL } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { PrismaService } from "../../../database/prisma.service.js";
import type { PartyCoordinationResponse } from "../dto/party-coordination.dto.js";
import { GamePartiesRepository } from "../repositories/game-parties.repository.js";

const partyInclude = {
  members: {
    orderBy: { joinedAt: "asc" },
    include: {
      user: {
        select: {
          displayName: true,
          telegramContactVisible: true,
          authIdentities: {
            where: { provider: "telegram" },
            select: { telegramUsername: true },
            take: 1
          }
        }
      }
    }
  }
} satisfies Prisma.GamePartyInclude;
type CoordinationParty = Prisma.GamePartyGetPayload<{ include: typeof partyInclude }>;

@Injectable()
export class PartyCoordinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: GamePartiesRepository
  ) {}

  async get(slug: string, userId: string): Promise<PartyCoordinationResponse> {
    const canonical = await this.parties.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);
    if (!canonical) this.notFound();
    const party = await this.prisma.gameParty.findUnique({ where: { id: canonical.id }, include: partyInclude });
    this.assertMember(party, userId);
    return this.response(party, userId);
  }

  async update(
    slug: string, userId: string, membershipId: string,
    change: { ready: boolean } | { visible: boolean }
  ): Promise<{ changed: boolean; coordination: PartyCoordinationResponse }> {
    const canonical = await this.parties.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);
    if (!canonical) this.notFound();
    return this.prisma.$transaction(async (tx) => {
      const party = await tx.gameParty.findUnique({ where: { id: canonical.id }, include: partyInclude });
      this.assertMember(party, userId);
      const member = party.members.find((item) => item.userId === userId)!;
      if (member.id !== membershipId) this.staleMembership();
      // Serialize this membership's toggles and concurrent removal/rejoin.
      await tx.$queryRaw`SELECT "id" FROM "social"."game_party_members"
        WHERE "id" = ${membershipId}::uuid AND "user_id" = ${userId}::uuid FOR UPDATE`;
      const current = await tx.gamePartyMember.findUnique({ where: { id: membershipId } });
      if (!current || current.userId !== userId || current.partyId !== party.id) this.staleMembership();
      const patch = "ready" in change
        ? { readyAt: change.ready ? (current.readyAt ?? new Date()) : null }
        : { telegramContactShared: change.visible };
      const changed = "ready" in change
        ? Boolean(current.readyAt) !== change.ready
        : current.telegramContactShared !== change.visible;
      if (changed) {
        const updated = await tx.gamePartyMember.updateMany({
          where: { id: membershipId, partyId: party.id, userId }, data: patch
        });
        if (updated.count !== 1) this.staleMembership();
      }
      const refreshed = await tx.gameParty.findUnique({ where: { id: party.id }, include: partyInclude });
      this.assertMember(refreshed, userId);
      return { changed, coordination: this.response(refreshed, userId) };
    });
  }

  private response(party: CoordinationParty, viewer: string): PartyCoordinationResponse {
    return {
      id: party.id, slug: party.slug, name: party.name, maxMembers: party.maxMembers,
      expiresAt: party.expiresAt?.toISOString() ?? null,
      members: party.members.map((member) => {
        const canSeeContact = member.userId === viewer || member.telegramContactShared || member.user.telegramContactVisible;
        const username = member.user.authIdentities[0]?.telegramUsername;
        return {
          membershipId: member.id, userId: member.userId, displayName: member.user.displayName,
          positionRole: member.positionRole, isSelf: member.userId === viewer,
          readyAt: member.readyAt?.toISOString() ?? null,
          telegramUsername: canSeeContact && username && /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : null,
          telegramContactShared: member.telegramContactShared,
          telegramContactPublic: member.user.telegramContactVisible
        };
      })
    };
  }

  private assertMember(party: CoordinationParty | null, userId: string): asserts party is CoordinationParty {
    if (!party || (party.expiresAt && party.expiresAt.getTime() <= Date.now())) this.notFound();
    if (!party.members.some((member) => member.userId === userId)) {
      throw createAppException({ code: AppErrorCode.Forbidden, message: "Only party members can see contacts and readiness", statusCode: HttpStatus.FORBIDDEN });
    }
  }

  private notFound(): never {
    throw createAppException({ code: AppErrorCode.NotFound, message: "Party was not found", statusCode: HttpStatus.NOT_FOUND });
  }

  private staleMembership(): never {
    throw createAppException({ code: AppErrorCode.Conflict, message: "Party membership changed", statusCode: HttpStatus.CONFLICT });
  }
}
