import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DOTA_ATTRIBUTE_KEYS, DOTA_VERTICAL } from "@reviewo/shared";
import type { Prisma, DotaTournament } from "#prisma/client";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../database/prisma.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import type { TournamentRecruitInviteDto } from "./dto/tournament-participation.dto.js";
import { readTournamentTeamInvite, type TournamentTeamInvitePayload } from "./tournament-recruitment-payload.js";

const ROLES = ["1", "2", "3", "4", "5"];
const ACTIVE = ["RECRUITING", "REGISTERED", "RESERVE"] as const;
type Database = PrismaService | Prisma.TransactionClient;
const prefix = (tournamentId: string, userId: string) => `tournament-recruit:${tournamentId}:${userId}:`;

@Injectable()
export class TournamentRecruitmentService {
  constructor(private readonly prisma: PrismaService, private readonly tournaments: DotaTournamentsService) {}

  private async captain(slug: string, entryId: string, userId: string, db: Database = this.prisma) {
    const entry = await db.dotaTournamentEntry.findFirst({ where: { id: entryId, tournament: { slug, status: { not: "DRAFT" } } },
      include: { tournament: { include: { sponsors: { select: { id: true } } } }, teamParty: { select: { ownerUserId: true } }, members: { where: { isActive: true }, include: { user: { select: { status: true } } } } } });
    if (!entry) throw new NotFoundException("Команда турнира не найдена.");
    if ((entry.createdByUserId ?? entry.teamParty?.ownerUserId) !== userId || !entry.members.some(member => member.userId === userId && member.user?.status === "active"))
      throw new ForbiddenException("Поиск игроков доступен капитану этой команды.");
    const freeRoles = ROLES.filter(role => !entry.members.some(member => member.positionRole === role));
    const needed = ACTIVE.includes(entry.status as typeof ACTIVE[number]) && this.tournaments.participationOpen(entry.tournament) && entry.members.length < 5 && freeRoles.length > 0;
    return { entry, freeRoles, needed };
  }

  private async seekers(tournament: DotaTournament & { sponsors: Array<{ id: string }> }, freeRoles = ROLES, take = 24,
    db: Database = this.prisma, unannouncedOnly = false) {
    const rows = await db.dotaTournamentSoloSearch.findMany({ where: { tournamentId: tournament.id, status: "WAITING", roles: { hasSome: freeRoles },
      ...(unannouncedOnly ? { recruitmentAnnouncedGeneration: { lt: this.prisma.dotaTournamentSoloSearch.fields.generation } } : {}),
      user: { status: "active", authIdentities: { some: { provider: "telegram" } },
        ...(tournament.sponsors.length ? { dotaTournamentSponsorClicks: { some: { tournamentId: tournament.id } } } : {}),
        dotaTournamentEntryMembers: { none: { tournamentId: tournament.id, isActive: true, entry: { status: { in: [...ACTIVE] } } } },
        dotaTournamentJoinRequests: { none: { tournamentId: tournament.id, status: "PENDING" } } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take, include: { user: true } });
    const ids = rows.map(row => row.userId);
    if (!ids.length) return [];
    const [profiles, clicks] = await Promise.all([
      db.entity.findMany({ where: { ownerUserId: { in: ids }, type: "person", visibility: "ACTIVE",
        attributes: { some: { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL } } }, orderBy: { createdAt: "desc" },
        select: { ownerUserId: true, title: true, slug: true, attributes: { where: { key: DOTA_ATTRIBUTE_KEYS.mmr }, select: { value: true } } } }),
      tournament.sponsors.length ? db.dotaTournamentSponsorClick.findMany({ where: { tournamentId: tournament.id, userId: { in: ids } }, select: { userId: true } }) : Promise.resolve([])
    ]);
    const profileMap = new Map<string, typeof profiles[number]>();
    for (const profile of profiles) if (profile.ownerUserId && !profileMap.has(profile.ownerUserId)) profileMap.set(profile.ownerUserId, profile);
    if (unannouncedOnly) for (const row of rows) {
      if (!profileMap.has(row.userId)) await db.dotaTournamentSoloSearch.updateMany({ where: { id: row.id, generation: row.generation, status: "WAITING" }, data: { status: "CANCELLED" } });
    }
    const supported = new Set(clicks.map(click => click.userId));
    return rows.flatMap(row => {
      const profile = profileMap.get(row.userId);
      if (!profile || (tournament.sponsors.length > 0 && !supported.has(row.userId))) return [];
      const roles = row.roles.filter(role => ROLES.includes(role));
      const positions = roles.filter(role => freeRoles.includes(role));
      if (!positions.length) return [];
      const mmr = Number.parseInt(profile.attributes[0]?.value ?? "", 10);
      return [{ queueId: row.id, generation: row.generation, userId: row.userId, name: profile.title.slice(0, 80),
        profileSlug: profile.slug, mmr: Number.isFinite(mmr) ? mmr : null, roles, positions,
        announced: row.recruitmentAnnouncedGeneration, startedAt: row.createdAt.toISOString() }];
    });
  }

  async board(slug: string, entryId: string, user: AuthenticatedUser, noticeId?: string) {
    const { entry, freeRoles, needed } = await this.captain(slug, entryId, user.id);
    const preference = await this.prisma.dotaTournamentRecruitPreference.findUnique({ where: { tournamentId_userId: { tournamentId: entry.tournamentId, userId: user.id } } });
    const enabled = needed && Boolean(preference?.enabled);
    if (noticeId) {
      const [notice, identity] = await Promise.all([
        this.prisma.telegramBotNotification.findUnique({ where: { id: noticeId } }),
        this.prisma.userAuthIdentity.findFirst({ where: { userId: user.id, provider: "telegram" }, select: { providerUserId: true } })
      ]);
      const payload = notice?.payload as Record<string, unknown> | undefined;
      if (!enabled || !notice || notice.deliveredAt || notice.telegramUserId !== identity?.providerUserId ||
        payload?.["type"] !== "tournament_recruiting" || payload["entryId"] !== entryId || payload["captainUserId"] !== user.id)
        throw new NotFoundException("Уведомление больше не актуально.");
    }
    const players = needed ? (await this.seekers(entry.tournament, freeRoles)).filter(player => player.userId !== user.id).slice(0, 12) : [];
    return { entryId, name: entry.teamNameSnapshot, status: entry.status, needed, enabled, freeRoles,
      players: players.map(({ userId: _userId, announced: _announced, ...player }) => player) };
  }

  async setSearching(slug: string, entryId: string, enabled: boolean, user: AuthenticatedUser) {
    const initial = await this.captain(slug, entryId, user.id);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${initial.entry.tournamentId}`}))`;
      const current = await this.captain(slug, entryId, user.id, tx);
      if (enabled && !current.needed) throw new ConflictException("В этой команде сейчас нельзя начать набор.");
      await tx.dotaTournamentRecruitPreference.upsert({ where: { tournamentId_userId: { tournamentId: current.entry.tournamentId, userId: user.id } },
        create: { tournamentId: current.entry.tournamentId, userId: user.id, enabled }, update: { enabled } });
      if (!enabled) await tx.telegramBotNotification.updateMany({ where: { eventKey: { startsWith: prefix(current.entry.tournamentId, user.id) }, deliveredAt: null }, data: { deliveredAt: new Date() } });
    });
    return this.board(slug, entryId, user);
  }

  async invite(slug: string, entryId: string, input: TournamentRecruitInviteDto, user: AuthenticatedUser) {
    const initial = await this.captain(slug, entryId, user.id);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${initial.entry.tournamentId}`}))`;
      const { entry, freeRoles, needed } = await this.captain(slug, entryId, user.id, tx);
      if (!needed || !freeRoles.includes(input.positionRole)) throw new ConflictException("Эта позиция уже занята.");
      const row = await tx.dotaTournamentSoloSearch.findFirst({ where: { id: input.queueId, tournamentId: entry.tournamentId,
        status: "WAITING", generation: input.generation }, include: { user: { include: { authIdentities: { where: { provider: "telegram" }, take: 1 } } } } });
      if (!row || row.userId === user.id || row.user.status !== "active" || !row.roles.includes(input.positionRole))
        throw new ConflictException("Игрок изменил поиск или уже нашёл команду.");
      const profile = await tx.entity.findFirst({ where: { ownerUserId: row.userId, type: "person", visibility: "ACTIVE",
        attributes: { some: { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL } } }, select: { id: true } });
      if (!profile) throw new ConflictException("Профиль игрока больше недоступен.");
      await this.tournaments.assertSoloQueueAllowed(tx, entry.tournament, row.userId);
      if (await tx.dotaTournamentEntryMember.findFirst({ where: { tournamentId: entry.tournamentId, userId: row.userId, isActive: true } }) ||
        await tx.dotaTournamentEntryRequest.findFirst({ where: { tournamentId: entry.tournamentId, userId: row.userId, status: "PENDING" } }))
        throw new ConflictException("Игрок уже выбрал команду.");
      const identity = row.user.authIdentities[0];
      if (!identity) throw new ConflictException("Игроку недоступно приглашение в Telegram.");
      const key = `tournament-invite:${entryId}:${row.id}:${row.generation}`;
      const previous = await tx.telegramBotNotification.findFirst({ where: { telegramUserId: identity.providerUserId, eventKey: key } });
      if (previous) {
        const payload = readTournamentTeamInvite(previous.payload);
        if (payload && Date.parse(payload.expiresAt) > Date.now()) {
          if (!payload.roles.includes(input.positionRole)) throw new ConflictException("Этому игроку уже предложена другая позиция. Дождись ответа.");
          return;
        }
        throw new ConflictException("Приглашение истекло. Игрок может вступить через страницу команды.");
      }
      const payload: TournamentTeamInvitePayload = {
        type: "tournament_team_invite",
        tournamentId: entry.tournamentId,
        tournamentSlug: slug,
        tournamentTitle: entry.tournament.title,
        entryId,
        entryName: entry.teamNameSnapshot,
        senderUserId: user.id,
        senderName: user.displayName.slice(0, 80),
        targetUserId: row.userId,
        queueId: row.id,
        generation: row.generation,
        roles: [input.positionRole],
        expiresAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString()
      };
      await tx.telegramBotNotification.create({
        data: {
          telegramUserId: identity.providerUserId,
          eventKey: key,
          payload: payload as unknown as Prisma.InputJsonValue
        }
      });
    });
    return { queued: true };
  }

  async invitation(slug: string, noticeId: string, user: AuthenticatedUser) {
    const [notice, identity] = await Promise.all([
      this.prisma.telegramBotNotification.findUnique({ where: { id: noticeId } }),
      this.prisma.userAuthIdentity.findFirst({ where: { userId: user.id, provider: "telegram" }, select: { providerUserId: true } })
    ]);
    const payload = readTournamentTeamInvite(notice?.payload);
    if (!notice || !payload || payload.targetUserId !== user.id || payload.tournamentSlug !== slug ||
      notice.telegramUserId !== identity?.providerUserId || Date.parse(payload.expiresAt) <= Date.now())
      throw new NotFoundException("Приглашение истекло или относится к другому аккаунту.");
    const { entry, freeRoles, needed } = await this.captain(slug, payload.entryId, payload.senderUserId);
    const queue = await this.prisma.dotaTournamentSoloSearch.findFirst({ where: { id: payload.queueId, userId: user.id,
      tournamentId: entry.tournamentId, status: "WAITING", generation: payload.generation } });
    const roles = payload.roles.filter(role => freeRoles.includes(role) && queue?.roles.includes(role));
    if (!needed || !queue || !roles.length) throw new ConflictException("Игрок или состав уже изменились. Выбери другую команду.");
    return { id: notice.id, tournamentId: entry.tournamentId, tournamentSlug: slug, tournamentTitle: entry.tournament.title,
      entryId: entry.id, name: entry.teamNameSnapshot, status: entry.status, senderName: payload.senderName, roles, joinMode: "OPEN" as const, expiresAt: payload.expiresAt };
  }

  async accept(slug: string, noticeId: string, role: "1" | "2" | "3" | "4" | "5", user: AuthenticatedUser) {
    const invitation = await this.invitation(slug, noticeId, user);
    await this.tournaments.joinEntry(slug, invitation.entryId, { positionRole: role }, user, undefined, noticeId);
    return { entryId: invitation.entryId };
  }

  async announce(tournamentId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournamentId}`}))`;
      const tournament = await tx.dotaTournament.findUnique({ where: { id: tournamentId }, include: { sponsors: { select: { id: true } } } });
      if (!tournament) return;
      const preferences = await tx.dotaTournamentRecruitPreference.findMany({ where: { tournamentId, enabled: true },
        include: { user: { include: { authIdentities: { where: { provider: "telegram" }, take: 1 } } } } });
      if (!this.tournaments.participationOpen(tournament)) {
        await tx.dotaTournamentRecruitPreference.updateMany({ where: { tournamentId, enabled: true }, data: { enabled: false } });
        return;
      }
      const players = await this.seekers(tournament, ROLES, 40, tx, true);
      const entries = await tx.dotaTournamentEntry.findMany({ where: { tournamentId, status: { in: [...ACTIVE] } },
        include: { teamParty: { select: { ownerUserId: true } }, members: { where: { isActive: true }, select: { userId: true, positionRole: true } } } });
      for (const preference of preferences) {
        const entry = entries.find(item => (item.createdByUserId ?? item.teamParty?.ownerUserId) === preference.userId && item.members.some(member => member.userId === preference.userId));
        if (!entry || entry.members.length >= 5 || preference.user.status !== "active") {
          await tx.dotaTournamentRecruitPreference.update({ where: { id: preference.id }, data: { enabled: false } });
          continue;
        }
        const free = ROLES.filter(role => !entry.members.some(member => member.positionRole === role));
        if (!players.some(player => player.userId !== preference.userId && player.roles.some(role => free.includes(role)))) continue;
        const identity = preference.user.authIdentities[0];
        if (!identity) continue;
        const pending = await tx.telegramBotNotification.findFirst({ where: { telegramUserId: identity.providerUserId,
          eventKey: { startsWith: prefix(tournamentId, preference.userId) }, deliveredAt: null, attempts: 0 }, orderBy: { createdAt: "desc" } });
        // Lock a still-unclaimed digest. Delivery reads the live board, so new players
        // join this digest without rewriting a payload that may already be in flight.
        if (pending && (await tx.telegramBotNotification.updateMany({ where: { id: pending.id, deliveredAt: null, attempts: 0 }, data: { nextAttemptAt: pending.nextAttemptAt } })).count) continue;
        const scheduled = new Date(Math.max(Date.now() + 10_000, preference.nextNotificationAt?.getTime() ?? 0));
        await tx.telegramBotNotification.create({ data: { telegramUserId: identity.providerUserId,
          eventKey: prefix(tournamentId, preference.userId) + randomUUID(), nextAttemptAt: scheduled,
          payload: { type: "tournament_recruiting", tournamentId, tournamentSlug: tournament.slug, tournamentTitle: tournament.title,
            entryId: entry.id, captainUserId: preference.userId } } });
        await tx.dotaTournamentRecruitPreference.update({ where: { id: preference.id }, data: { nextNotificationAt: new Date(scheduled.getTime() + 60_000) } });
      }
      for (const player of players) await tx.dotaTournamentSoloSearch.updateMany({ where: { id: player.queueId, generation: player.generation, status: "WAITING" },
        data: { recruitmentAnnouncedGeneration: player.generation } });
    }, { timeout: 10_000 });
  }
}
