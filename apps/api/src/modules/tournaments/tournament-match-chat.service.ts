import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { AppErrorCode } from "../../common/exceptions/app-error-code.js";
import { createAppException } from "../../common/exceptions/app.exception.js";
import { TournamentRoomEvents } from "./tournament-room-events.js";
import { TOURNAMENT_AFTERPARTY_MS } from "./tournament-room-policy.js";

type Db = PrismaService | Prisma.TransactionClient;
const staff = (user: { role: string }) => user.role === "ADMIN" || user.role === "TOURNAMENT_MODERATOR";
const members = { where: { isActive: true, roomLeftAt: null }, select: { userId: true, displayName: true, dotaProfileSlug: true } } as const;

@Injectable()
export class TournamentMatchChatService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  private readonly logger = new Logger(TournamentMatchChatService.name);
  constructor(private readonly prisma: PrismaService, private readonly events: TournamentRoomEvents) {}
  onModuleInit() { this.timer = setInterval(() => void this.cleanup(), 60_000).unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private fail(message: string, statusCode = HttpStatus.FORBIDDEN): never {
    throw createAppException({ code: statusCode === HttpStatus.NOT_FOUND ? AppErrorCode.NotFound : AppErrorCode.Forbidden, message, statusCode });
  }
  async requireReader(slug: string, matchId: string, user: AuthenticatedUser, db: Db = this.prisma) {
    if (user.status !== "active") this.fail("Active account required");
    const match = await db.dotaTournamentMatch.findFirst({ where: { id: matchId, tournament: { slug } },
      include: { tournament: true, entryA: { include: { members } }, entryB: { include: { members } } } });
    if (!match || (match.tournament.status === "DRAFT" && !staff(user))) this.fail("Match not found", HttpStatus.NOT_FOUND);
    const expiresAt = ["COMPLETED", "CANCELLED"].includes(match.tournament.status)
      ? new Date((match.tournament.finishedAt ?? match.tournament.updatedAt).getTime() + TOURNAMENT_AFTERPARTY_MS) : null;
    if (expiresAt && expiresAt <= new Date()) this.fail("Match chat has expired", HttpStatus.NOT_FOUND);
    if (!staff(user) && ![...match.entryA.members, ...match.entryB.members].some((member) => member.userId === user.id))
      this.fail("Only match participants and tournament staff can access this chat");
    return match;
  }
  async list(slug: string, matchId: string, user: AuthenticatedUser, before?: string) {
    const match = await this.requireReader(slug, matchId, user);
    const cursor = before ? await this.prisma.dotaTournamentMatchChatMessage.findFirst({
      where: { id: before, matchId }, select: { id: true, createdAt: true }
    }) : null;
    if (before && !cursor) this.fail("Invalid chat cursor", HttpStatus.BAD_REQUEST);
    const rows = await this.prisma.dotaTournamentMatchChatMessage.findMany({
      where: { matchId },
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51
    });
    const targets = new Map([...match.entryA.members, ...match.entryB.members].filter((member) => member.userId)
      .map((member) => [member.userId!, { userId: member.userId!, displayName: member.displayName }]));
    const page = rows.slice(0, 50);
    return { messages: page.reverse(), nextCursor: rows.length > 50 ? rows[49]?.id ?? null : null,
      targets: [...targets.values()].filter((target) => target.userId !== user.id) };
  }
  async send(slug: string, matchId: string, user: AuthenticatedUser, text: string, requestedTargets: string[] = []) {
    const message = text.trim();
    if (!message || message.length > 4000 || requestedTargets.length > 5) this.fail("Invalid message", HttpStatus.BAD_REQUEST);
    const result = await this.prisma.$transaction(async (tx) => {
      // Match-scoped serialization makes concurrent mentions share the same cooldown.
      await tx.$queryRaw`SELECT id FROM social.dota_tournament_matches WHERE id = ${matchId}::uuid FOR UPDATE`;
      const match = await this.requireReader(slug, matchId, user, tx);
      const lineupIds = [...match.entryA.members, ...match.entryB.members].map((member) => member.userId).filter((id): id is string => !!id);
      const ids = [...new Set(requestedTargets)].filter((id) => id !== user.id);
      const targets = await tx.user.findMany({ where: { id: { in: ids }, status: "active",
        OR: [...(match.tournament.status === "DRAFT" ? [] : [{ id: { in: lineupIds } }]), { role: { in: ["ADMIN", "TOURNAMENT_MODERATOR"] } }] },
        select: { id: true, displayName: true, authIdentities: { where: { provider: "telegram" }, select: { providerUserId: true } } } });
      if (targets.length !== ids.length) this.fail("Mention target is not in this match", HttpStatus.BAD_REQUEST);
      const mentions: Array<{ userId: string; displayName: string; notified: boolean }> = [];
      const saved = await tx.dotaTournamentMatchChatMessage.create({ data: { matchId, userId: user.id,
        displayName: user.displayName.slice(0, 200), message } });
      for (const target of targets) {
        const claimed = await tx.$queryRaw<Array<{ target_user_id: string }>>`
          INSERT INTO social.dota_tournament_match_mention_cooldowns(match_id,target_user_id,notified_at)
          VALUES (${matchId}::uuid,${target.id}::uuid,now())
          ON CONFLICT(match_id,target_user_id) DO UPDATE SET notified_at=EXCLUDED.notified_at
          WHERE social.dota_tournament_match_mention_cooldowns.notified_at <= now()-interval '5 minutes'
          RETURNING target_user_id`;
        mentions.push({ userId: target.id, displayName: target.displayName, notified: claimed.length > 0 });
        if (!claimed.length) continue;
        const notice = await tx.dotaTournamentMatchChatMention.create({ data: { messageId: saved.id, targetUserId: target.id } });
        if (target.authIdentities[0]) await tx.telegramBotNotification.createMany({ skipDuplicates: true, data: [{
          telegramUserId: target.authIdentities[0].providerUserId, eventKey: "match_mention:" + notice.id,
          payload: { type: "tournament_match_mention", mentionId: notice.id, matchId,
            tournamentSlug: slug, tournamentTitle: match.tournament.title, author: user.displayName,
            teams: match.entryA.teamNameSnapshot + " — " + match.entryB.teamNameSnapshot, message: message.slice(0, 1000) }
        }] });
      }
      return tx.dotaTournamentMatchChatMessage.update({ where: { id: saved.id }, data: { mentions } });
    });
    this.events.matchChanged(matchId);
    return result;
  }
  async inbox(user: AuthenticatedUser) {
    const where = { targetUserId: user.id, readAt: null, message: { match: {
      tournament: { ...(staff(user) ? {} : { status: { not: "DRAFT" as const } }), OR: [{ status: { notIn: ["COMPLETED" as const, "CANCELLED" as const] } },
        { finishedAt: { gt: new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS) } }] },
      ...(staff(user) ? {} : { OR: [
        { entryA: { members: { some: { userId: user.id, isActive: true, roomLeftAt: null } } } },
        { entryB: { members: { some: { userId: user.id, isActive: true, roomLeftAt: null } } } }
      ] })
    } } };
    const [count, items] = await Promise.all([
      this.prisma.dotaTournamentMatchChatMention.count({ where }),
      this.prisma.dotaTournamentMatchChatMention.findMany({ where, take: 25, orderBy: { createdAt: "desc" },
        include: { message: { include: { match: { include: { tournament: true, entryA: true, entryB: true } } } } } })
    ]);
    return { count, items: items.map((item) => ({ id: item.id, eventId: item.id,
      tournamentTitle: item.message.match.tournament.title, teams: item.message.match.entryA.teamNameSnapshot + " — " + item.message.match.entryB.teamNameSnapshot,
      reason: item.message.displayName + ": " + item.message.message.slice(0, 300),
      href: "/games/tournaments/" + encodeURIComponent(item.message.match.tournament.slug) + "/matches/" + item.message.matchId + "#match-chat"
    })) };
  }
  async readMention(id: string, user: AuthenticatedUser) {
    await this.prisma.dotaTournamentMatchChatMention.updateMany({ where: { id, targetUserId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
  private async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const tournaments = await this.prisma.dotaTournament.findMany({ where: { status: { in: ["COMPLETED", "CANCELLED"] },
        OR: [{ finishedAt: { lt: new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS) } },
          { finishedAt: null, updatedAt: { lt: new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS) } }],
        matches: { some: { chatMessages: { some: {} } } } }, select: { id: true }, take: 25 });
      if (!tournaments.length) return;
      const where = { match: { tournamentId: { in: tournaments.map((item) => item.id) } } };
      const batch = await this.prisma.dotaTournamentMatchChatMessage.findMany({ where, select: { id: true }, take: 500 });
      await this.prisma.dotaTournamentMatchChatMessage.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
      await this.prisma.dotaTournamentMatchMentionCooldown.deleteMany({ where });
    } catch { this.logger.error("Could not clean up expired match chats"); }
    finally { this.cleaning = false; }
  }
}
