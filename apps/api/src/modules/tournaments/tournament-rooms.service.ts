import { HttpStatus, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { createAppException } from "../../common/exceptions/app.exception.js";
import { AppErrorCode } from "../../common/exceptions/app-error-code.js";
import { AuthService } from "../auth/services/auth.service.js";
import { DiscordVoiceService } from "../social/services/discord-voice.service.js";
import { TournamentRoomEvents } from "./tournament-room-events.js";
import { tournamentRoomState } from "./tournament-room-policy.js";

const entryInclude = {
  tournament: true,
  teamParty: { select: { ownerUserId: true } },
  members: { where: { isActive: true }, orderBy: [{ positionRole: "asc" }, { createdAt: "asc" }] },
  room: true
} satisfies Prisma.DotaTournamentEntryInclude;

@Injectable()
export class DotaTournamentRoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DotaTournamentRoomsService.name);
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  private voiceCursor: string | undefined;
  private expiredCursor: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly discord: DiscordVoiceService,
    private readonly events: TournamentRoomEvents
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.cleanupExpired(), 60_000).unref();
    void this.cleanupExpired();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  notifyChanged(entryId: string) { this.events.changed(entryId); }

  private error(code: AppErrorCode, message: string, statusCode: HttpStatus): never {
    throw createAppException({ code, message, statusCode });
  }

  private async entry(slug: string, entryId: string, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const entry = await db.dotaTournamentEntry.findFirst({
      where: { id: entryId, tournament: { slug, status: { not: "DRAFT" } } },
      include: entryInclude
    });
    if (!entry) this.error(AppErrorCode.NotFound, "Tournament team was not found", HttpStatus.NOT_FOUND);
    return entry;
  }

  private accessible(entry: Awaited<ReturnType<DotaTournamentRoomsService["entry"]>>, userId: string) {
    return tournamentRoomState(entry, entry.tournament).phase !== "CLOSED" &&
      entry.members.some((member) => member.userId === userId && !member.roomLeftAt);
  }

  private canReviewChat(user?: AuthenticatedUser) {
    return user?.role === "ADMIN" || user?.role === "TOURNAMENT_MODERATOR";
  }

  async get(slug: string, entryId: string, user?: AuthenticatedUser) {
    const entry = await this.entry(slug, entryId);
    const state = tournamentRoomState(entry, entry.tournament);
    const isMember = !!user && this.accessible(entry, user.id);
    const canReadChat = state.phase !== "CLOSED" && (isMember || this.canReviewChat(user));
    const currentEntry = user ? await this.prisma.dotaTournamentEntryMember.findFirst({
      where: { tournamentId: entry.tournamentId, userId: user.id, isActive: true },
      select: { entryId: true }
    }) : null;
    const pending = user ? await this.prisma.dotaTournamentEntryRequest.findFirst({
      where: { tournamentId: entry.tournamentId, userId: user.id, status: "PENDING" },
      select: { entryId: true, positionRole: true }
    }) : null;
    const registrationOpen = entry.tournament.status === "REGISTRATION_OPEN" &&
      (!entry.tournament.registrationClosesAt || entry.tournament.registrationClosesAt > new Date());
    const reserveRecruiting = entry.status === "RESERVE" &&
      entry.tournament.status === "REGISTRATION_CLOSED" && !entry.tournament.bracketGeneratedAt;
    const rosterRecruitingAllowed = registrationOpen || reserveRecruiting;
    return {
      entryId: entry.id,
      name: entry.teamNameSnapshot,
      description: entry.description,
      joinMode: entry.joinMode,
      status: entry.status,
      phase: state.phase,
      expiresAt: state.expiresAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      tournament: { slug: entry.tournament.slug, title: entry.tournament.title, status: entry.tournament.status },
      members: entry.members.map((member) => ({
        userId: canReadChat ? member.userId : null,
        displayName: member.displayName,
        dotaProfileSlug: member.dotaProfileSlug,
        positionRole: member.positionRole,
        mmr: member.mmr,
        hasLeft: !!member.roomLeftAt
      })),
      isMember,
      isCaptain: isMember && (entry.createdByUserId ?? entry.teamParty?.ownerUserId) === user?.id,
      canEditDescription: isMember && (entry.createdByUserId ?? entry.teamParty?.ownerUserId) === user?.id,
      canReadChat,
      canWriteChat: canReadChat,
      canJoin: rosterRecruitingAllowed && state.phase === "TOURNAMENT" && !currentEntry &&
        entry.members.length < 5,
      canLeave: isMember && (rosterRecruitingAllowed || state.phase === "AFTERPARTY"),
      canManageRoster: rosterRecruitingAllowed,
      currentEntryId: currentEntry?.entryId ?? null,
      pendingEntryId: pending?.entryId ?? null,
      pendingRole: pending?.positionRole ?? null,
      voice: isMember && entry.room?.discordChannelId && this.discord.isConfigured()
        ? { channelId: entry.room.discordChannelId, guildId: this.discord.getGuildId() }
        : null
    };
  }

  async listMine(user: AuthenticatedUser) {
    const entries = await this.prisma.dotaTournamentEntry.findMany({
      where: {
        status: { in: ["RECRUITING", "REGISTERED", "RESERVE"] },
        members: { some: { userId: user.id, isActive: true, roomLeftAt: null } },
        tournament: { status: { not: "DRAFT" } }
      },
      include: { tournament: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return entries.flatMap((entry) => {
      const state = tournamentRoomState(entry, entry.tournament);
      return state.phase === "CLOSED" ? [] : [{
        entryId: entry.id, name: entry.teamNameSnapshot,
        tournamentSlug: entry.tournament.slug, tournamentTitle: entry.tournament.title,
        phase: state.phase, expiresAt: state.expiresAt?.toISOString() ?? null
      }];
    });
  }

  async updateDescription(slug: string, entryId: string, user: AuthenticatedUser, text: string) {
    if (text.length > 1000)
      this.error(AppErrorCode.ValidationError, "Team description must not exceed 1000 characters", HttpStatus.BAD_REQUEST);
    const description = text.trim();
    const initial = await this.entry(slug, entryId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const entry = await this.entry(slug, entryId, tx);
      if (!this.accessible(entry, user.id) ||
        (entry.createdByUserId ?? entry.teamParty?.ownerUserId) !== user.id)
        this.error(AppErrorCode.Forbidden, "Only the current team captain can edit its description", HttpStatus.FORBIDDEN);
      await tx.dotaTournamentEntry.update({ where: { id: entry.id }, data: { description } });
    });
    this.events.changed(entryId);
    return { description };
  }

  async requireReader(slug: string, entryId: string, user: AuthenticatedUser) {
    const entry = await this.entry(slug, entryId);
    if (tournamentRoomState(entry, entry.tournament).phase === "CLOSED")
      this.error(AppErrorCode.NotFound, "Tournament team room has expired", HttpStatus.NOT_FOUND);
    if (!this.accessible(entry, user.id) && !this.canReviewChat(user))
      this.error(AppErrorCode.Forbidden, "Only team members and tournament staff can read this chat", HttpStatus.FORBIDDEN);
    return entry;
  }

  private async ensureRoom(entry: Awaited<ReturnType<DotaTournamentRoomsService["entry"]>>, tx: Prisma.TransactionClient) {
    const { expiresAt } = tournamentRoomState(entry, entry.tournament);
    return tx.dotaTournamentRoom.upsert({
      where: { entryId: entry.id },
      create: { entryId: entry.id, expiresAt },
      update: { expiresAt }
    });
  }

  async listMessages(slug: string, entryId: string, user: AuthenticatedUser, before?: string, requestedLimit = 50) {
    const entry = await this.requireReader(slug, entryId, user);
    if (!entry.room) {
      if (before) this.error(AppErrorCode.ValidationError, "Invalid chat cursor", HttpStatus.BAD_REQUEST);
      return { messages: [], nextCursor: null };
    }
    const limit = Math.max(1, Math.min(100, requestedLimit));
    const cursor = before ? await this.prisma.dotaTournamentRoomMessage.findFirst({
      where: { id: before, roomId: entry.room.id }, select: { id: true, createdAt: true }
    }) : null;
    if (before && !cursor) this.error(AppErrorCode.ValidationError, "Invalid chat cursor", HttpStatus.BAD_REQUEST);
    const items = await this.prisma.dotaTournamentRoomMessage.findMany({
      where: {
        roomId: entry.room.id,
        ...(cursor ? { OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } }
        ] } : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1
    });
    const page = items.slice(0, limit);
    return { messages: page.reverse().map((message) => this.message(message)),
      nextCursor: items.length > limit ? items[limit - 1]!.id : null };
  }

  private message(message: { id: string; body: string; senderUserId: string | null; senderName: string; createdAt: Date }) {
    return { id: message.id, body: message.body, senderUserId: message.senderUserId,
      senderName: message.senderName, createdAt: message.createdAt.toISOString() };
  }

  async sendMessage(slug: string, entryId: string, user: AuthenticatedUser, text: string) {
    const body = text.trim();
    if (!body || body.length > 10000)
      this.error(AppErrorCode.ValidationError, "Message must contain 1 to 10000 characters", HttpStatus.BAD_REQUEST);
    const initial = await this.entry(slug, entryId);
    const message = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const entry = await this.entry(slug, entryId, tx);
      if (tournamentRoomState(entry, entry.tournament).phase === "CLOSED" ||
        (!this.accessible(entry, user.id) && !this.canReviewChat(user)))
        this.error(AppErrorCode.Forbidden, "Only current team members and tournament staff can write in this chat", HttpStatus.FORBIDDEN);
      const room = await this.ensureRoom(entry, tx);
      return tx.dotaTournamentRoomMessage.create({
        data: { roomId: room.id, body, senderUserId: user.id,
          senderName: (entry.members.find((member) => member.userId === user.id)?.displayName ?? user.displayName).slice(0, 80) }
      });
    });
    this.events.changed(entryId);
    return this.message(message);
  }

  async leaveAfterparty(slug: string, entryId: string, user: AuthenticatedUser) {
    const initial = await this.entry(slug, entryId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const entry = await this.entry(slug, entryId, tx);
      if (tournamentRoomState(entry, entry.tournament).phase !== "AFTERPARTY" || !this.accessible(entry, user.id))
        this.error(AppErrorCode.Conflict, "You are not in an active afterparty", HttpStatus.CONFLICT);
      await tx.dotaTournamentEntryMember.updateMany({
        where: { entryId, userId: user.id, isActive: true }, data: { roomLeftAt: new Date() }
      });
    });
    await this.syncAccess(entryId);
    return { ok: true };
  }

  async ensureVoice(slug: string, entryId: string, user: AuthenticatedUser, intent: "create" | "join") {
    if (!this.discord.isConfigured())
      this.error(AppErrorCode.ServiceUnavailable, "Discord voice is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    const identity = intent === "join" ? await this.auth.getDiscordUserId(user.id) : null;
    if (intent === "join" && !identity)
      this.error(AppErrorCode.DiscordNotLinked, "Link Discord to join the team voice", HttpStatus.FORBIDDEN);
    let createdChannel: string | null = null;
    let grantedChannel: string | null = null;
    try {
      const voice = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"tournament-room:" + entryId}))`;
        let entry = await this.entry(slug, entryId, tx);
        if (!this.accessible(entry, user.id))
          this.error(AppErrorCode.Forbidden, "Only current team members can use this voice", HttpStatus.FORBIDDEN);
        let room = await this.ensureRoom(entry, tx);
        if (!room.discordChannelId) {
          const result = await this.discord.createPartyVoice({
            name: "FDP · " + entry.teamNameSnapshot + " · " + entryId.slice(0, 6),
            maxAgeSeconds: 604800, strictAccess: true
          });
          createdChannel = result.channelId;
          room = await tx.dotaTournamentRoom.update({ where: { id: room.id },
            data: { discordChannelId: result.channelId, discordInviteUrl: result.inviteUrl } });
          await tx.dotaTournamentRoomMessage.create({
            data: { roomId: room.id, senderName: "FDP",
              body: "Discord voice готов — нажми «Войти в войс» или открой канал: https://discord.com/channels/" +
                this.discord.getGuildId() + "/" + result.channelId }
          });
        }
        const channelId = room.discordChannelId!;
        let inviteUrl = room.discordInviteUrl!;
        let movedToVoice = false;
        if (identity) {
          await this.discord.ensureVoiceChannelAcl(channelId);
          const old = await tx.dotaTournamentRoomVoiceGrant.findUnique({
            where: { roomId_userId: { roomId: room.id, userId: user.id } }
          });
          if (old && old.discordUserId !== identity)
            await this.discord.revokeMemberVoiceAccess(channelId, old.discordUserId, true);
          await this.discord.grantMemberVoiceAccess(channelId, identity);
          grantedChannel = channelId;
          await tx.dotaTournamentRoomVoiceGrant.upsert({
            where: { roomId_userId: { roomId: room.id, userId: user.id } },
            create: { roomId: room.id, userId: user.id, discordUserId: identity },
            update: { discordUserId: identity }
          });
          inviteUrl = await this.discord.createJoinInvite(channelId);
          entry = await this.entry(slug, entryId, tx);
          if (!this.accessible(entry, user.id))
            this.error(AppErrorCode.Forbidden, "You have left this team", HttpStatus.FORBIDDEN);
          movedToVoice = await this.discord.tryMoveMemberToVoice(channelId, identity);
        }
        entry = await this.entry(slug, entryId, tx);
        if (!this.accessible(entry, user.id))
          this.error(AppErrorCode.Forbidden, "The team room is no longer available", HttpStatus.FORBIDDEN);
        return { channelId, guildId: this.discord.getGuildId(), inviteUrl, movedToVoice };
      }, { timeout: 90000, maxWait: 10000 });
      this.events.changed(entryId);
      return voice;
    } catch (error) {
      if (identity && grantedChannel)
        await this.discord.revokeMemberVoiceAccess(grantedChannel, identity).catch(() => undefined);
      if (createdChannel) await this.discord.deleteChannel(createdChannel).catch(() => undefined);
      throw error;
    }
  }

  // Persisted Discord IDs also cover identities subsequently unlinked from FDP.
  async syncAccess(entryId: string, notify = true) {
    if (notify) this.events.changed(entryId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"tournament-room:" + entryId}))`;
        const room = await tx.dotaTournamentRoom.findUnique({
          where: { entryId }, include: { entry: { include: entryInclude }, voiceGrants: true }
        });
        if (!room?.discordChannelId) return;
        for (const grant of room.voiceGrants) {
          if (this.accessible(room.entry, grant.userId)) continue;
          await this.discord.revokeMemberVoiceAccess(room.discordChannelId, grant.discordUserId, true);
          await tx.dotaTournamentRoomVoiceGrant.delete({
            where: { roomId_userId: { roomId: room.id, userId: grant.userId } }
          });
        }
      }, { timeout: 90000, maxWait: 10000 });
    } catch (error) {
      this.logger.warn("Tournament voice access will be retried: " + String(error));
    }
  }

  async cleanupExpired() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      // A voice may finish creating concurrently with the tournament's completion.
      // Repair missing expiries durably, including after a process restart.
      const unscheduled = await this.prisma.dotaTournamentRoom.findMany({
        where: { expiresAt: null, OR: [
          { entry: { status: { notIn: ["RECRUITING", "REGISTERED", "RESERVE"] } } },
          { entry: { tournament: { status: { in: ["COMPLETED", "CANCELLED"] } } } }
        ] },
        select: { entryId: true }, take: 25
      });
      for (const item of unscheduled) {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"tournament-room:" + item.entryId}))`;
          const room = await tx.dotaTournamentRoom.findUnique({
            where: { entryId: item.entryId }, include: { entry: { include: { tournament: true } } }
          });
          if (!room || room.expiresAt) return;
          const state = tournamentRoomState(room.entry, room.entry.tournament);
          if (state.expiresAt || state.phase === "CLOSED")
            await tx.dotaTournamentRoom.update({
              where: { id: room.id }, data: { expiresAt: state.expiresAt ?? new Date() }
            });
        });
      }
      const rooms = await this.prisma.dotaTournamentRoom.findMany({
        where: { expiresAt: { lte: new Date() }, ...(this.expiredCursor ? { id: { gt: this.expiredCursor } } : {}) },
        select: { id: true, entryId: true }, take: 25, orderBy: { id: "asc" }
      });
      this.expiredCursor = rooms.length === 25 ? rooms.at(-1)?.id : undefined;
      for (const item of rooms) {
        const removed = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"tournament-room:" + item.entryId}))`;
          const room = await tx.dotaTournamentRoom.findUnique({
            where: { entryId: item.entryId }, include: { entry: { include: { tournament: true } } }
          });
          if (!room?.expiresAt || room.expiresAt > new Date()) return false;
          if (tournamentRoomState(room.entry, room.entry.tournament).phase !== "CLOSED") return false;
          await tx.dotaTournamentRoomMessage.deleteMany({ where: { roomId: room.id } });
          if (room.discordChannelId &&
            (!this.discord.isConfigured() || !(await this.discord.deleteChannel(room.discordChannelId)))) return false;
          await tx.dotaTournamentRoom.delete({ where: { id: room.id } });
          return true;
        }, { timeout: 90000, maxWait: 10000 }).catch((error: unknown) => {
          this.logger.warn("Could not clean tournament room: " + String(error));
          return false;
        });
        if (removed) this.events.changed(item.entryId);
      }
      const voiceRooms = await this.prisma.dotaTournamentRoom.findMany({
        where: { voiceGrants: { some: {} }, ...(this.voiceCursor ? { id: { gt: this.voiceCursor } } : {}) },
        select: { id: true, entryId: true }, orderBy: { id: "asc" }, take: 25
      });
      this.voiceCursor = voiceRooms.length === 25 ? voiceRooms.at(-1)?.id : undefined;
      for (const room of voiceRooms) await this.syncAccess(room.entryId, false);
    } catch (error) { this.logger.error("Tournament room cleanup failed", error); }
    finally { this.cleaning = false; }
  }
}
