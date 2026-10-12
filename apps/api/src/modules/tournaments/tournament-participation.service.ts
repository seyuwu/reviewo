import { ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DotaTournament, DotaTournamentSoloSearch } from "#prisma/client";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../database/prisma.service.js";
import { DotaProfileService } from "../dota/services/dota-profile.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import type { StartTournamentSoloSearchDto, TournamentSoloTicket } from "./dto/tournament-participation.dto.js";
import { TournamentRecruitmentService } from "./tournament-recruitment.service.js";

const ACTIVE_ENTRIES = ["RECRUITING", "REGISTERED", "RESERVE"] as const;
const ROLES = ["1", "2", "3", "4", "5"] as const;
type Candidate = { row: DotaTournamentSoloSearch; user: AuthenticatedUser; roles: string[] };

@Injectable()
export class TournamentParticipationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TournamentParticipationService.name);
  private timer?: NodeJS.Timeout;
  private scanning = false;
  private scanCursor = 0;
  private readonly jobs = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService, private readonly profiles: DotaProfileService,
    private readonly tournaments: DotaTournamentsService, private readonly recruitment?: TournamentRecruitmentService) {}

  onModuleInit() {
    this.timer = setInterval(() => { void this.scan(); }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tournament(slug: string) {
    const tournament = await this.prisma.dotaTournament.findFirst({ where: { slug, status: { not: "DRAFT" } },
      include: { sponsors: { orderBy: { sortOrder: "asc" } } } });
    if (!tournament) throw new NotFoundException("Tournament was not found");
    return tournament;
  }

  async entryLink(entryId: string) {
    const entry = await this.prisma.dotaTournamentEntry.findFirst({ where: { id: entryId,
      status: { in: [...ACTIVE_ENTRIES] }, tournament: { status: { not: "DRAFT" } } }, include: { tournament: true } });
    if (!entry) throw new NotFoundException("Tournament invitation is no longer available");
    return { tournamentId: entry.tournamentId, slug: entry.tournament.slug, entryId: entry.id,
      teamName: entry.teamNameSnapshot, tournamentTitle: entry.tournament.title };
  }

  async state(slug: string, user: AuthenticatedUser) {
    const tournament = await this.tournament(slug);
    const [profile, member, requests, queue, click, preference] = await Promise.all([
      this.profiles.getMyProfile(user).catch((error: unknown) => {
        if (error instanceof HttpException && error.getStatus() === 404) return null;
        throw error;
      }),
      this.prisma.dotaTournamentEntryMember.findFirst({ where: { tournamentId: tournament.id, userId: user.id,
        isActive: true, entry: { status: { in: [...ACTIVE_ENTRIES] } } }, include: {
        entry: { include: { members: { where: { isActive: true }, orderBy: { positionRole: "asc" },
          include: { user: { select: { authIdentities: { where: { provider: "telegram" }, select: { telegramUsername: true }, take: 1 } } } } },
          teamParty: { select: { ownerUserId: true } } } }
      } }),
      this.prisma.dotaTournamentEntryRequest.findMany({ where: { tournamentId: tournament.id, userId: user.id, status: "PENDING" },
        include: { entry: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.prisma.dotaTournamentSoloSearch.findUnique({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } } }),
      this.prisma.dotaTournamentSponsorClick.findUnique({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } }, select: { id: true } }),
      this.prisma.dotaTournamentRecruitPreference.findUnique({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } } })
    ]);
    const roles = profile?.roles.filter(role => ROLES.includes(role as typeof ROLES[number])) ?? [];
    const request = requests[0];
    const open = this.tournaments.participationOpen(tournament);
    const state = member ? "JOINED" : !open ? "CLOSED" : !profile ? "NEEDS_PROFILE" : request ? "REQUESTED" : queue?.status === "WAITING" ? "WAITING" : "NONE";
    const searchRoles = queue?.status === "WAITING" ? queue.roles.filter(role => ROLES.includes(role as typeof ROLES[number])) : roles;
    const suggestions = !member && open && profile ? await this.suggestions(tournament, searchRoles, profile.mmr, false, requests.map(item => item.entryId)) : [];
    return { tournament: { id: tournament.id, slug, title: tournament.title, status: tournament.status,
      startsAt: tournament.startsAt?.toISOString() ?? null, registrationClosesAt: tournament.registrationClosesAt?.toISOString() ?? null,
      description: tournament.description, format: tournament.format, gameMode: tournament.gameMode, rulesUrl: tournament.rulesUrl },
      state, roles, profileMmr: profile?.mmr ?? null, queueRoles: queue?.status === "WAITING" ? queue.roles : [], queueMode: queue?.status === "WAITING" ? queue.mode : null,
      sponsorRequired: open && tournament.sponsors.length > 0 && !click,
      sponsors: tournament.sponsors.map(sponsor => ({ id: sponsor.id, name: sponsor.name, url: sponsor.url })),
      entry: member ? { id: member.entry.id, membershipId: member.id, name: member.entry.teamNameSnapshot, status: member.entry.status,
        canLeave: (tournament.status === "REGISTRATION_OPEN" && (!tournament.registrationClosesAt || tournament.registrationClosesAt > new Date()))
          || (member.entry.status === "RESERVE" && tournament.status === "REGISTRATION_CLOSED" && !tournament.bracketGeneratedAt),
        isCaptain: (member.entry.createdByUserId ?? member.entry.teamParty?.ownerUserId) === user.id,
        recruiting: open && member.entry.members.length < 5 && Boolean(preference?.enabled),
        joinMode: member.entry.joinMode, ownRole: member.positionRole,
        members: member.entry.members.map(player => {
          const username = player.user?.authIdentities[0]?.telegramUsername;
          return { name: player.displayName, role: player.positionRole, mmr: player.mmr,
            telegramUsername: username && /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : null };
        }) } : null,
      request: request ? { entryId: request.entryId, entryName: request.entry.teamNameSnapshot, role: request.positionRole } : null,
      requests: requests.map(item => ({ id: item.id, entryId: item.entryId, entryName: item.entry.teamNameSnapshot, role: item.positionRole })),
      suggestions };
  }

  private async suggestions(tournament: DotaTournament, roles: string[], mmr: string | null, automatic = false, excludeEntries: string[] = []) {
    const entries = await this.prisma.dotaTournamentEntry.findMany({ where: { tournamentId: tournament.id,
      ...(excludeEntries.length ? { id: { notIn: excludeEntries } } : {}), ...(automatic ? { joinMode: "OPEN" as const } : {}),
      status: { in: tournament.status === "REGISTRATION_CLOSED" ? ["RESERVE"] : [...ACTIVE_ENTRIES] } },
      include: { members: { where: { isActive: true }, select: { positionRole: true, mmr: true } } }, orderBy: { createdAt: "asc" } });
    const ownMmr = Number.parseInt(mmr ?? "", 10);
    return entries.flatMap(entry => {
      if (entry.members.length >= 5) return [];
      const freeRoles = ROLES.filter(candidate => !entry.members.some(member => member.positionRole === candidate));
      const role = roles.find(candidate => freeRoles.includes(candidate as typeof ROLES[number])) ?? (automatic ? undefined : freeRoles[0]);
      if (!role) return [];
      const mmrs = entry.members.map(member => member.mmr).filter((value): value is number => value !== null);
      const averageMmr = mmrs.length ? Math.round(mmrs.reduce((total, value) => total + value, 0) / mmrs.length) : null;
      return [{ entryId: entry.id, name: entry.teamNameSnapshot, status: entry.status, role, freeRoles: [...freeRoles], joinMode: entry.joinMode, memberCount: entry.members.length, averageMmr,
        distance: Number.isFinite(ownMmr) && averageMmr !== null ? Math.abs(ownMmr - averageMmr) : 0 }];
    }).sort((a, b) => b.memberCount - a.memberCount || a.distance - b.distance).slice(0, automatic ? 3 : 6)
      .map(({ distance: _distance, ...suggestion }) => suggestion);
  }

  async start(slug: string, input: StartTournamentSoloSearchDto, user: AuthenticatedUser) {
    const tournament = await this.tournament(slug);
    const profile = await this.profiles.getMyProfile(user);
    const roles = input.roles ?? profile.roles;
    const mode = input.mode ?? "AUTO";
    if (!roles.length || roles.some(role => !ROLES.includes(role as typeof ROLES[number]))) throw new ConflictException("Выбери позиции для турнира от 1 до 5.");
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const current = await tx.dotaTournament.findUniqueOrThrow({ where: { id: tournament.id } });
      await this.tournaments.assertSoloQueueAllowed(tx, current, user.id);
      const member = await tx.dotaTournamentEntryMember.findFirst({ where: { tournamentId: current.id, userId: user.id, isActive: true } });
      if (member) return;
      if (await tx.dotaTournamentEntryRequest.findFirst({ where: { tournamentId: current.id, userId: user.id, status: "PENDING" } })) return;
      const old = await tx.dotaTournamentSoloSearch.findUnique({ where: { tournamentId_userId: { tournamentId: current.id, userId: user.id } } });
      if (old?.status === "WAITING" && old.mode === mode && JSON.stringify(old.roles) === JSON.stringify(roles)) return;
      await tx.dotaTournamentSoloSearch.upsert({ where: { tournamentId_userId: { tournamentId: current.id, userId: user.id } },
        create: { tournamentId: current.id, userId: user.id, roles: [...new Set(roles)], mode },
        update: { roles: [...new Set(roles)], mode, status: "WAITING", assignedEntryId: null, generation: { increment: 1 }, createdAt: new Date() } });
    });
    const work = (mode === "AUTO" ? this.process(tournament.id) : Promise.resolve()).catch(() => { this.logger.warn("Tournament solo matching will retry"); });
    if (this.recruitment) void this.recruitment.announce(tournament.id).catch(() => this.logger.warn("Tournament recruitment announcements will retry"));
    // HTTP and bot callbacks never wait behind the full background matching pass.
    await Promise.race([work, new Promise<void>(resolve => { const timer = setTimeout(resolve, 1500); timer.unref(); })]);
    return this.state(slug, user);
  }

  async cancel(slug: string, user: AuthenticatedUser) {
    const tournament = await this.tournament(slug);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      await tx.dotaTournamentSoloSearch.updateMany({ where: { tournamentId: tournament.id, userId: user.id, status: "WAITING" },
        data: { status: "CANCELLED", generation: { increment: 1 } } });
      await tx.dotaTournamentEntryRequest.updateMany({ where: { tournamentId: tournament.id, userId: user.id, status: "PENDING" },
        data: { status: "WITHDRAWN" } });
    });
    return this.state(slug, user);
  }

  async cancelRequest(slug: string, requestId: string, user: AuthenticatedUser) {
    const tournament = await this.tournament(slug);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const changed = await tx.dotaTournamentEntryRequest.updateMany({
        where: { id: requestId, tournamentId: tournament.id, userId: user.id, status: "PENDING" }, data: { status: "WITHDRAWN" }
      });
      if (!changed.count) throw new ConflictException("Заявка уже обработана или отозвана. Обнови участие.");
    });
    return this.state(slug, user);
  }

  private async scan() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const pending = await this.prisma.dotaTournamentSoloSearch.groupBy({ by: ["tournamentId"], where: { status: "WAITING" }, orderBy: { tournamentId: "asc" } });
      const count = Math.min(20, pending.length);
      for (let index = 0; index < count; index++) {
        const id = pending[(this.scanCursor + index) % pending.length]!.tournamentId;
        await this.process(id);
        await this.recruitment?.announce(id);
      }
      this.scanCursor = pending.length ? (this.scanCursor + count) % pending.length : 0;
    } catch { this.logger.warn("Tournament solo matching scan will retry"); }
    finally { this.scanning = false; }
  }

  private process(tournamentId: string) {
    const previous = this.jobs.get(tournamentId);
    if (previous) return previous;
    const work = this.match(tournamentId).finally(() => { if (this.jobs.get(tournamentId) === work) this.jobs.delete(tournamentId); });
    this.jobs.set(tournamentId, work);
    return work;
  }

  private async match(tournamentId: string) {
    const leaseToken = randomUUID();
    const claimed = await this.prisma.dotaTournament.updateMany({ where: { id: tournamentId,
      OR: [{ soloMatchLeaseUntil: null }, { soloMatchLeaseUntil: { lt: new Date() } }] },
      data: { soloMatchLeaseToken: leaseToken, soloMatchLeaseUntil: new Date(Date.now() + 90_000) } });
    if (!claimed.count) return;
    try {
      const tournament = await this.prisma.dotaTournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (!this.tournaments.participationOpen(tournament)) {
        await this.prisma.dotaTournamentSoloSearch.updateMany({ where: { tournamentId, status: "WAITING" }, data: { status: "EXPIRED" } });
        return;
      }
      // Keep a bounded pass while selecting the oldest candidates for every role.
      // A long queue for one position must not hide a compatible player behind it.
      const batches = await Promise.all(ROLES.map(role => this.prisma.dotaTournamentSoloSearch.findMany({
        where: { tournamentId, status: "WAITING", mode: "AUTO", roles: { has: role } }, include: { user: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 8
      })));
      const rows = [...new Map(batches.flat().map(row => [row.id, row])).values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const candidates: Candidate[] = [];
      for (const row of rows) {
        const member = await this.prisma.dotaTournamentEntryMember.findFirst({ where: { tournamentId, userId: row.userId, isActive: true } });
        if (member) {
          await this.prisma.dotaTournamentSoloSearch.updateMany({ where: { id: row.id, generation: row.generation, status: "WAITING" }, data: { status: "MATCHED", assignedEntryId: member.entryId } });
          continue;
        }
        const identity = row.user.role === "ADMIN" || await this.prisma.userAuthIdentity.findFirst({ where: { userId: row.userId, provider: "telegram" }, select: { id: true } });
        if (row.user.status !== "active" || !identity) { await this.cancelRow(row); continue; }
        try {
          await this.profiles.getMyProfile(row.user);
          const roles = row.roles.filter(role => ROLES.includes(role as typeof ROLES[number]));
          if (roles.length) candidates.push({ row, user: row.user, roles });
          else await this.cancelRow(row);
        } catch (error) {
          if (error instanceof HttpException && error.getStatus() === 404) await this.cancelRow(row);
          else throw error;
        }
      }
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index]!;
        const renewed = await this.prisma.dotaTournament.updateMany({ where: { id: tournamentId, soloMatchLeaseToken: leaseToken,
          soloMatchLeaseUntil: { gt: new Date() } }, data: { soloMatchLeaseUntil: new Date(Date.now() + 90_000) } });
        if (!renewed.count) return;
        const current = await this.state(tournament.slug, candidate.user);
        if (current.state !== "WAITING" || current.sponsorRequired) continue;
        const ticket: TournamentSoloTicket = { id: candidate.row.id, generation: candidate.row.generation, leaseToken };
        let joined = false;
        for (const suggestion of await this.suggestions(tournament, candidate.roles, current.profileMmr, true)) {
          const role = candidate.roles.find(value => value === suggestion.role);
          if (!role) continue;
          try {
            await this.tournaments.joinEntry(tournament.slug, suggestion.entryId, { positionRole: role as typeof ROLES[number] }, candidate.user, ticket);
            joined = true; break;
          } catch (error) { if (!(error instanceof HttpException) || ![403, 409].includes(error.getStatus())) throw error; }
        }
        if (joined) continue;
        // A sole waiting player does not consume a new squad. At least two distinct
        // compatible queued players must exist before opening an automatic roster.
        const pair = candidates.slice(index + 1).find(other => candidate.roles.some(role => other.roles.some(second => second !== role)));
        if (!pair) continue;
        const role = candidate.roles.find(value => pair.roles.some(second => second !== value));
        if (!role) continue;
        const otherState = await this.state(tournament.slug, pair.user);
        if (otherState.state !== "WAITING" || otherState.sponsorRequired) continue;
        const secondRole = pair.roles.find(value => value !== role);
        if (!secondRole) continue;
        try { await this.tournaments.createSquad(tournament.slug, { positionRole: role as typeof ROLES[number], joinMode: "OPEN" }, candidate.user, ticket,
          { user: pair.user, positionRole: secondRole as typeof ROLES[number],
            ticket: { id: pair.row.id, generation: pair.row.generation, leaseToken } }); }
        catch (error) { if (!(error instanceof HttpException) || ![403, 409].includes(error.getStatus())) throw error; }
      }
    } finally {
      await this.prisma.dotaTournament.updateMany({ where: { id: tournamentId, soloMatchLeaseToken: leaseToken },
        data: { soloMatchLeaseToken: null, soloMatchLeaseUntil: null } });
    }
  }

  private cancelRow(row: DotaTournamentSoloSearch) {
    return this.prisma.dotaTournamentSoloSearch.updateMany({ where: { id: row.id, generation: row.generation, status: "WAITING" }, data: { status: "CANCELLED" } });
  }
}
