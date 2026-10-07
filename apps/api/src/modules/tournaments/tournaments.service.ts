import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DotaTournamentMatchStatus, DotaTournamentStatus, Prisma } from "#prisma/client";
import { DOTA_PARTY_VERTICAL } from "@reviewo/shared";

import { AppErrorCode } from "../../common/exceptions/app-error-code.js";
import { createAppException } from "../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../database/prisma.service.js";
import { DotaProfileService } from "../dota/services/dota-profile.service.js";
import { GamePartiesService } from "../social/services/game-parties.service.js";
import type {
  CreateDotaTournamentDto,
  UpdateDotaTournamentDto
} from "./dto/create-dota-tournament.dto.js";
import type { RegisterDotaTournamentTeamDto } from "./dto/register-dota-tournament-team.dto.js";
import type { CreateDotaTournamentSquadDto } from "./dto/create-dota-tournament-squad.dto.js";
import type { JoinDotaTournamentEntryDto } from "./dto/join-dota-tournament-entry.dto.js";
import type { ReplaceTournamentMatchSideDto } from "./dto/replace-tournament-match-side.dto.js";
import type {
  ConfirmDotaTournamentLobbyDto,
  ConfirmDotaTournamentStageDto,
  CreateDotaTournamentMatchDto,
  DisputeDotaTournamentMatchDto,
  ResolveDotaTournamentMatchDto,
  SubmitDotaTournamentMatchGameDto,
  SubmitDotaTournamentLobbyDto,
  SubmitDotaTournamentResultDto
} from "./dto/create-dota-tournament-match.dto.js";

import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { bracketRoundOffset, buildBracket } from "./tournament-bracket.js";
import { DotaTournamentRoomsService } from "./tournament-rooms.service.js";
import { currentGameNumber, nextGameState, recordSeriesGame, seriesScore, type SeriesGame } from "./tournament-series.js";
import { TOURNAMENT_AFTERPARTY_MS } from "./tournament-room-policy.js";

const PUBLIC_TOURNAMENT_STATUSES: DotaTournamentStatus[] = [
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
];

const LOBBY_SETUP_GRACE_MS = 15 * 60 * 1000;
const LOBBY_CONFIRMATION_MS = 5 * 60 * 1000;
const SPECTATOR_ADMISSION_MS = 2 * 60 * 1000;
const MATCH_RESULT_CONFIRMATION_MS = 10 * 60 * 1000;
const MATCH_DURATION_LIMIT_MS = 4 * 60 * 60 * 1000;
const MATCH_TIMEOUT_SCAN_MS = 30 * 1000;
const TOURNAMENT_ROLES = ["1", "2", "3", "4", "5"] as const;

type MatchSide = "A" | "B";

@Injectable()
export class DotaTournamentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DotaTournamentsService.name);
  private matchTimeoutTimer?: NodeJS.Timeout;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly gamePartiesService: GamePartiesService,
    private readonly dotaProfileService: DotaProfileService,
    private readonly bracketService: DotaTournamentBracketService,
    @Optional() private readonly roomsService?: DotaTournamentRoomsService
  ) {}

  onModuleInit(): void {
    void this.expireOverdueMatches().catch((error: unknown) => {
      this.logger.error("Could not expire overdue tournament matches", error);
    });
    this.matchTimeoutTimer = setInterval(() => {
      void this.expireOverdueMatches().catch((error: unknown) => {
        this.logger.error("Could not expire overdue tournament matches", error);
      });
    }, MATCH_TIMEOUT_SCAN_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.matchTimeoutTimer) clearInterval(this.matchTimeoutTimer);
  }

  async listPublic() {
    const items = await this.prismaService.dotaTournament.findMany({
      include: { _count: { select: { entries: { where: { status: "REGISTERED" } } } } },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      where: { status: { in: PUBLIC_TOURNAMENT_STATUSES } }
    });
    const completed = await this.completedPodiums(items);
    return items.map((item) => ({
      ...this.toTournamentSummary(item),
      podium: completed.get(item.id) ?? []
    }));
  }

  async getPublic(slug: string) {
    const tournament = await this.prismaService.dotaTournament.findFirst({
      include: {
        _count: { select: { entries: { where: { status: "REGISTERED" } } } },
        bracketSeeds: true,
        matchPlans: true,
        matches: {
          include: {
            games: { orderBy: { gameNumber: "asc" }, select: { gameNumber: true, dotaMatchId: true, winnerEntryId: true, startedAt: true, completedAt: true } },
            entryA: { select: { id: true, teamNameSnapshot: true } },
            entryB: { select: { id: true, teamNameSnapshot: true } }
          },
          orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }]
        },
        entries: {
          include: {
            members: {
              where: { isActive: true },
              orderBy: [{ positionRole: "asc" }, { createdAt: "asc" }]
            },
            teamParty: { select: { slug: true } }
          },
          orderBy: { createdAt: "asc" },
          where: { status: { in: ["RECRUITING", "REGISTERED", "RESERVE"] } }
        }
      },
      where: { slug, status: { in: PUBLIC_TOURNAMENT_STATUSES } }
    });

    if (!tournament) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return {
      ...this.toTournamentSummary(tournament),
      ...this.bracketPresentation(tournament),
      matches: tournament.matches.map((match) => this.toMatchSummary(match)),
      entries: tournament.entries.map((entry) => ({
        id: entry.id,
        joinMode: entry.joinMode,
        members: entry.members.map((member) => ({
          displayName: member.displayName,
          dotaProfileSlug: member.dotaProfileSlug,
          mmr: member.mmr,
          positionRole: member.positionRole
        })),
        status: entry.status,
        teamName: entry.teamNameSnapshot,
        teamPartySlug: entry.teamParty?.slug ?? null
      }))
    };
  }

  async listManagedEntries(tournamentSlug: string, currentUser: AuthenticatedUser) {
    const tournament = await this.prismaService.dotaTournament.findFirst({
      select: { id: true },
      where: { slug: tournamentSlug, status: { in: PUBLIC_TOURNAMENT_STATUSES } }
    });
    if (!tournament) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const entries = await this.prismaService.dotaTournamentEntry.findMany({
      include: {
        joinRequests: { orderBy: { createdAt: "asc" }, where: { status: "PENDING" } },
        members: {
          orderBy: [{ positionRole: "asc" }, { createdAt: "asc" }],
          where: { isActive: true }
        },
        teamParty: { select: { ownerUserId: true } }
      },
      orderBy: { createdAt: "asc" },
      where: {
        OR: [
          { createdByUserId: currentUser.id },
          { createdByUserId: null, teamParty: { ownerUserId: currentUser.id } }
        ],
        status: { in: ["RECRUITING", "REGISTERED", "RESERVE"] },
        tournamentId: tournament.id
      }
    });

    return entries
      .filter((entry) => (entry.createdByUserId ?? entry.teamParty?.ownerUserId) === currentUser.id)
      .map((entry) => ({
        entryId: entry.id,
        joinMode: entry.joinMode,
        members: entry.members.map((member) => ({
          displayName: member.displayName,
          dotaProfileSlug: member.dotaProfileSlug,
          mmr: member.mmr,
          positionRole: member.positionRole
        })),
        requests: entry.joinRequests.map((request) => ({
          displayName: request.displayName,
          dotaProfileSlug: request.dotaProfileSlug,
          id: request.id,
          mmr: request.mmr,
          positionRole: request.positionRole
        })),
        status: entry.status
      }));
  }

  async createSquad(
    tournamentSlug: string,
    input: CreateDotaTournamentSquadDto,
    currentUser: AuthenticatedUser
  ) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Tournament squad name must contain at least two characters",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const tournament = await this.prismaService.dotaTournament.findFirst({
      where: { slug: tournamentSlug, status: { in: PUBLIC_TOURNAMENT_STATUSES } }
    });
    if (!tournament) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    this.assertEntryCanRecruit(tournament, "RESERVE");

    let profile;
    try {
      profile = await this.dotaProfileService.getMyProfile(currentUser);
    } catch {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Create a Dota profile before creating a tournament squad",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    if (!profile.roles.includes(input.positionRole)) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Choose a position listed in your Dota profile",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const parsedMmr = profile.mmr ? Number.parseInt(profile.mmr, 10) : Number.NaN;
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const latestTournament = await tx.dotaTournament.findUnique({ where: { id: tournament.id } });
      if (!latestTournament) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Tournament was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }
      this.assertEntryCanRecruit(latestTournament, "RESERVE");

      const existingMember = await tx.dotaTournamentEntryMember.findFirst({
        where: { isActive: true, tournamentId: tournament.id, userId: currentUser.id }
      });
      const existingRequest = await tx.dotaTournamentEntryRequest.findFirst({
        where: { status: "PENDING", tournamentId: tournament.id, userId: currentUser.id }
      });
      if (existingMember || existingRequest) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "You already belong to or have a pending request for a squad in this tournament",
          statusCode: HttpStatus.CONFLICT
        });
      }

      const entry = await tx.dotaTournamentEntry.create({
        data: {
          createdByUserId: currentUser.id,
          joinMode: input.joinMode ?? "CONFIRM",
          status: latestTournament.status === "REGISTRATION_CLOSED" ? "RESERVE" : "RECRUITING",
          teamNameSnapshot: name.slice(0, 80),
          teamPartyId: null,
          teamSlugSnapshot: `tournament-squad-${randomUUID()}`,
          tournamentId: tournament.id
        }
      });
      await tx.dotaTournamentEntryMember.create({
        data: {
          displayName: profile.title.slice(0, 80),
          dotaProfileSlug: profile.slug,
          entryId: entry.id,
          isActive: true,
          mmr: Number.isFinite(parsedMmr) ? parsedMmr : null,
          positionRole: input.positionRole,
          tournamentId: tournament.id,
          userId: currentUser.id
        }
      });
    });

    return this.getPublic(tournamentSlug);
  }

  async listTeamEntries(teamSlug: string, currentUser: AuthenticatedUser) {
    const party = await this.gamePartiesService.getPartyBySlug(teamSlug, currentUser.id);
    if (party.kind !== "TEAM" || !party.isOwner) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the team captain can manage tournament entries",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const entries = await this.prismaService.dotaTournamentEntry.findMany({
      include: {
        joinRequests: { orderBy: { createdAt: "asc" }, where: { status: "PENDING" } },
        members: {
          where: { isActive: true },
          orderBy: [{ positionRole: "asc" }, { createdAt: "asc" }]
        },
        tournament: true
      },
      orderBy: { createdAt: "desc" },
      where: { teamPartyId: party.id }
    });

    return entries.map((entry) => ({
      entryId: entry.id,
      joinMode: entry.joinMode,
      members: entry.members.map((member) => ({
        displayName: member.displayName,
        mmr: member.mmr,
        positionRole: member.positionRole
      })),
      requests: entry.joinRequests.map((request) => ({
        displayName: request.displayName,
        dotaProfileSlug: request.dotaProfileSlug,
        id: request.id,
        mmr: request.mmr,
        positionRole: request.positionRole
      })),
      status: entry.status,
      tournament: this.toTournamentSummary(entry.tournament)
    }));
  }

  async setEntryJoinMode(
    tournamentSlug: string,
    entryId: string,
    joinMode: "OPEN" | "CONFIRM",
    currentUser: AuthenticatedUser
  ) {
    const entry = await this.requireManagedEntry(tournamentSlug, entryId, currentUser.id);
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + entry.tournamentId}))`;
      const latest = await tx.dotaTournamentEntry.findUniqueOrThrow({
        where: { id: entryId }, include: { tournament: true, teamParty: { select: { ownerUserId: true } } }
      });
      this.assertEntryCanRecruit(latest.tournament, latest.status);
      if (!this.isActiveEntryStatus(latest.status) ||
        (latest.createdByUserId ?? latest.teamParty?.ownerUserId) !== currentUser.id)
        throw this.matchConflict("The roster or team captain has changed");
      await tx.dotaTournamentEntry.update({ data: { joinMode }, where: { id: entry.id } });
    });
    this.roomsService?.notifyChanged(entryId);
    return { joinMode, ok: true };
  }

  async joinEntry(
    tournamentSlug: string,
    entryId: string,
    input: JoinDotaTournamentEntryDto,
    currentUser: AuthenticatedUser
  ) {
    const { entry, tournament } = await this.findTournamentEntry(tournamentSlug, entryId);
    this.assertEntryCanRecruit(tournament, entry.status);
    if (!this.isActiveEntryStatus(entry.status)) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This team is not accepting players",
        statusCode: HttpStatus.CONFLICT
      });
    }

    let profile;
    try {
      profile = await this.dotaProfileService.getMyProfile(currentUser);
    } catch {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Create a Dota profile before joining a tournament team",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    if (!profile.roles.includes(input.positionRole)) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Choose a position listed in your Dota profile",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const parsedMmr = profile.mmr ? Number.parseInt(profile.mmr, 10) : Number.NaN;
    const snapshot = {
      displayName: profile.title.slice(0, 80),
      dotaProfileSlug: profile.slug,
      mmr: Number.isFinite(parsedMmr) ? parsedMmr : null,
      positionRole: input.positionRole
    };
    let result: "JOINED" | "REQUESTED" = "JOINED";

    try {
      await this.prismaService.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
        const latest = await tx.dotaTournamentEntry.findFirst({
          include: { tournament: true },
          where: { id: entryId, tournament: { slug: tournamentSlug } }
        });
        if (!latest || !this.isActiveEntryStatus(latest.status)) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This team is not accepting players",
            statusCode: HttpStatus.CONFLICT
          });
        }
        this.assertEntryCanRecruit(latest.tournament, latest.status);

        const existingMember = await tx.dotaTournamentEntryMember.findUnique({
          where: { entryId_userId: { entryId, userId: currentUser.id } }
        });
        if (existingMember?.isActive) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "You are already in this tournament roster",
            statusCode: HttpStatus.CONFLICT
          });
        }

        const activeMember = await tx.dotaTournamentEntryMember.findFirst({
          where: {
            isActive: true,
            tournamentId: tournament.id,
            userId: currentUser.id
          }
        });
        if (activeMember) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "You are already registered with another team in this tournament",
            statusCode: HttpStatus.CONFLICT
          });
        }

        const existingRequest = await tx.dotaTournamentEntryRequest.findUnique({
          where: { entryId_userId: { entryId, userId: currentUser.id } }
        });
        if (existingRequest?.status === "PENDING") {
          result = "REQUESTED";
          return;
        }

        await this.assertTournamentSlotAvailable(tx, {
          entryId,
          positionRole: input.positionRole,
          tournamentId: tournament.id,
          userId: currentUser.id
        });

        if (latest.joinMode === "CONFIRM") {
          const otherPending = await tx.dotaTournamentEntryRequest.findFirst({
            where: {
              entryId: { not: entryId },
              status: "PENDING",
              tournamentId: tournament.id,
              userId: currentUser.id
            }
          });
          if (otherPending) {
            throw createAppException({
              code: AppErrorCode.Conflict,
              message: "You already have a pending request to another team in this tournament",
              statusCode: HttpStatus.CONFLICT
            });
          }
          await tx.dotaTournamentEntryRequest.upsert({
            create: {
              ...snapshot,
              entryId,
              status: "PENDING",
              tournamentId: tournament.id,
              userId: currentUser.id
            },
            update: {
              ...snapshot,
              status: "PENDING"
            },
            where: { entryId_userId: { entryId, userId: currentUser.id } }
          });
          result = "REQUESTED";
          return;
        }

        await tx.dotaTournamentEntryMember.upsert({
          create: {
            ...snapshot,
            entryId,
            isActive: true,
            tournamentId: tournament.id,
            userId: currentUser.id
          },
          update: {
            ...snapshot,
            isActive: true,
            roomLeftAt: null
          },
          where: { entryId_userId: { entryId, userId: currentUser.id } }
        });
        await this.syncEntryRegistrationStatus(tx, entryId);
        if (existingRequest) {
          await tx.dotaTournamentEntryRequest.update({
            data: { status: "ACCEPTED" },
            where: { id: existingRequest.id }
          });
        }
      });
    } catch (error) {
      if (this.isPrismaUniqueError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "The team or position changed while you were joining. Refresh and try again",
          statusCode: HttpStatus.CONFLICT
        });
      }
      throw error;
    }

    this.roomsService?.notifyChanged(entryId);
    return { entryId, result, tournament: await this.getPublic(tournamentSlug) };
  }

  async decideJoinRequest(
    tournamentSlug: string,
    entryId: string,
    requestId: string,
    decision: "ACCEPT" | "DECLINE",
    currentUser: AuthenticatedUser
  ) {
    const entry = await this.requireManagedEntry(tournamentSlug, entryId, currentUser.id);
    const request = await this.prismaService.dotaTournamentEntryRequest.findFirst({
      where: { entryId, id: requestId, status: "PENDING" }
    });
    if (!request) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament join request was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (decision === "DECLINE") {
      await this.prismaService.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${entry.tournamentId}`}))`;
        const latestEntry = await tx.dotaTournamentEntry.findUnique({
          where: { id: entryId }, include: { tournament: true, teamParty: { select: { ownerUserId: true } } }
        });
        if (!latestEntry || !this.isActiveEntryStatus(latestEntry.status) ||
          (latestEntry.createdByUserId ?? latestEntry.teamParty?.ownerUserId) !== currentUser.id)
          throw this.matchConflict("The tournament team captain has changed");
        this.assertEntryCanRecruit(latestEntry.tournament, latestEntry.status);
        const declined = await tx.dotaTournamentEntryRequest.updateMany({
          data: { status: "DECLINED" },
          where: { id: request.id, status: "PENDING" }
        });
        if (declined.count !== 1) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This request has already been handled",
            statusCode: HttpStatus.CONFLICT
          });
        }
      });
      this.roomsService?.notifyChanged(entryId);
      return { ok: true, tournament: await this.getPublic(tournamentSlug) };
    }

    this.assertEntryCanRecruit(entry.tournament, entry.status);
    try {
      await this.prismaService.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${entry.tournamentId}`}))`;
        const latestRequest = await tx.dotaTournamentEntryRequest.findFirst({
          where: { entryId, id: requestId, status: "PENDING" }
        });
        if (!latestRequest) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This request has already been handled",
            statusCode: HttpStatus.CONFLICT
          });
        }
        const latestEntry = await tx.dotaTournamentEntry.findFirst({
          include: { tournament: true, teamParty: { select: { ownerUserId: true } } },
          where: { id: entryId, tournament: { slug: tournamentSlug } }
        });
        if (!latestEntry || !this.isActiveEntryStatus(latestEntry.status)) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This team is no longer registered for the tournament",
            statusCode: HttpStatus.CONFLICT
          });
        }
        if ((latestEntry.createdByUserId ?? latestEntry.teamParty?.ownerUserId) !== currentUser.id)
          throw this.matchConflict("The tournament team captain has changed");
        const currentTournament = await tx.dotaTournament.findUnique({
          where: { id: entry.tournamentId }
        });
        if (!currentTournament) {
          throw createAppException({
            code: AppErrorCode.NotFound,
            message: "Tournament was not found",
            statusCode: HttpStatus.NOT_FOUND
          });
        }
        this.assertEntryCanRecruit(currentTournament, latestEntry.status);
        await this.assertTournamentSlotAvailable(tx, {
          entryId,
          positionRole: request.positionRole,
          tournamentId: entry.tournamentId,
          userId: request.userId
        });
        await tx.dotaTournamentEntryMember.upsert({
          create: {
            displayName: request.displayName,
            dotaProfileSlug: request.dotaProfileSlug,
            entryId,
            isActive: true,
            mmr: request.mmr,
            positionRole: request.positionRole,
            tournamentId: entry.tournamentId,
            userId: request.userId
          },
          update: {
            displayName: request.displayName,
            dotaProfileSlug: request.dotaProfileSlug,
            isActive: true,
            roomLeftAt: null,
            mmr: request.mmr,
            positionRole: request.positionRole
          },
          where: { entryId_userId: { entryId, userId: request.userId } }
        });
        await tx.dotaTournamentEntryRequest.update({
          data: { status: "ACCEPTED" },
          where: { id: request.id }
        });
        await this.syncEntryRegistrationStatus(tx, entryId);
      });
    } catch (error) {
      if (this.isPrismaUniqueError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "The roster changed before this request was accepted",
          statusCode: HttpStatus.CONFLICT
        });
      }
      throw error;
    }
    this.roomsService?.notifyChanged(entryId);
    return { ok: true, tournament: await this.getPublic(tournamentSlug) };
  }

  async assignEntryPosition(
    tournamentSlug: string,
    entryId: string,
    positionRole: string,
    currentUser: AuthenticatedUser
  ) {
    const profile = await this.dotaProfileService.getMyProfile(currentUser);
    if (!profile.roles.includes(positionRole)) {
      throw this.matchConflict("Choose a position listed in your Dota profile");
    }
    const { tournament } = await this.findTournamentEntry(tournamentSlug, entryId);
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const entry = await tx.dotaTournamentEntry.findFirst({
        include: { tournament: true },
        where: { id: entryId, tournamentId: tournament.id }
      });
      if (!entry || !this.isActiveEntryStatus(entry.status)) {
        throw this.matchConflict("This tournament lineup is no longer active");
      }
      this.assertEntryCanRecruit(entry.tournament, entry.status);
      const member = await tx.dotaTournamentEntryMember.findUnique({
        where: { entryId_userId: { entryId, userId: currentUser.id } }
      });
      if (!member?.isActive) {
        throw this.matchConflict(
          "Only an active roster member can change their position"
        );
      }
      const occupied = await tx.dotaTournamentEntryMember.findFirst({
        where: { entryId, isActive: true, positionRole, userId: { not: currentUser.id } }
      });
      if (occupied) throw this.matchConflict("This position is already taken");
      await tx.dotaTournamentEntryMember.update({
        data: { positionRole },
        where: { id: member.id }
      });
      await this.syncEntryRegistrationStatus(tx, entryId);
    });
    this.roomsService?.notifyChanged(entryId);
    return this.getPublic(tournamentSlug);
  }

  async leaveEntry(tournamentSlug: string, entryId: string, currentUser: AuthenticatedUser) {
    const { entry, tournament } = await this.findTournamentEntry(tournamentSlug, entryId);
    if (!this.isActiveEntryStatus(entry.status)) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "You are not part of an active tournament entry",
        statusCode: HttpStatus.CONFLICT
      });
    }
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const latestTournament = await tx.dotaTournament.findUnique({ where: { id: tournament.id } });
      const latestEntry = await tx.dotaTournamentEntry.findFirst({
        where: { id: entryId, tournamentId: tournament.id }
      });
      const registrationOpen = latestTournament?.status === "REGISTRATION_OPEN" &&
        (!latestTournament.registrationClosesAt || latestTournament.registrationClosesAt > new Date());
      const reserveRecruiting = latestEntry?.status === "RESERVE" &&
        latestTournament?.status === "REGISTRATION_CLOSED" && !latestTournament.bracketGeneratedAt;
      if (
        !latestTournament ||
        !latestEntry ||
        !this.isActiveEntryStatus(latestEntry.status) ||
        (!registrationOpen && !reserveRecruiting)
      ) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "You can no longer leave this tournament roster",
          statusCode: HttpStatus.CONFLICT
        });
      }
      const member = await tx.dotaTournamentEntryMember.findUnique({
        where: { entryId_userId: { entryId, userId: currentUser.id } }
      });
      if (!member?.isActive) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "You are not in this tournament roster",
          statusCode: HttpStatus.NOT_FOUND
        });
      }
      await tx.dotaTournamentEntryMember.update({
        data: { isActive: false },
        where: { id: member.id }
      });
      if (latestEntry.createdByUserId === currentUser.id) {
        const nextCaptain = await tx.dotaTournamentEntryMember.findFirst({
          where: { entryId, isActive: true, userId: { not: null } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        });
        await tx.dotaTournamentEntry.update({
          where: { id: entryId },
          data: nextCaptain
            ? { createdByUserId: nextCaptain.userId }
            : { status: "WITHDRAWN" }
        });
        if (!nextCaptain) {
          await tx.dotaTournamentRoom.updateMany({
            where: { entryId }, data: { expiresAt: new Date() }
          });
          await tx.dotaTournamentEntryRequest.updateMany({
            where: { entryId, status: "PENDING" }, data: { status: "WITHDRAWN" }
          });
        }
      }
      await this.syncEntryRegistrationStatus(tx, entryId);
      await tx.dotaTournamentEntryRequest.updateMany({
        data: { status: "WITHDRAWN" },
        where: { entryId, status: "ACCEPTED", userId: currentUser.id }
      });
    });
    await this.roomsService?.syncAccess(entryId);
    return { ok: true, tournament: await this.getPublic(tournamentSlug) };
  }

  async removeEntryMember(tournamentSlug: string, entryId: string, userId: string, currentUser: AuthenticatedUser) {
    const managed = await this.requireManagedEntry(tournamentSlug, entryId, currentUser.id);
    if (userId === currentUser.id) throw this.matchConflict("Use leave to leave your own team");
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + managed.tournamentId}))`;
      const entry = await tx.dotaTournamentEntry.findUniqueOrThrow({
        where: { id: entryId }, include: { tournament: true, teamParty: { select: { ownerUserId: true } } }
      });
      this.assertEntryCanRecruit(entry.tournament, entry.status);
      if ((entry.createdByUserId ?? entry.teamParty?.ownerUserId) !== currentUser.id ||
        !this.isActiveEntryStatus(entry.status)) throw this.matchConflict("The roster or team captain has changed");
      const result = await tx.dotaTournamentEntryMember.updateMany({
        where: { entryId, userId, isActive: true }, data: { isActive: false }
      });
      if (!result.count) throw this.matchConflict("This player is no longer on the roster");
      await tx.dotaTournamentEntryRequest.updateMany({
        where: { entryId, userId, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "WITHDRAWN" }
      });
      await this.syncEntryRegistrationStatus(tx, entryId);
    });
    await this.roomsService?.syncAccess(entryId);
    return { ok: true };
  }

  async listAdminMatches(tournamentSlug: string) {
    await this.expireOverdueMatches();
    const tournament = await this.prismaService.dotaTournament.findUnique({
      where: { slug: tournamentSlug }
    });
    if (!tournament) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    const matches = await this.prismaService.dotaTournamentMatch.findMany({
      include: {
        games: { orderBy: { gameNumber: "asc" }, select: { gameNumber: true, dotaMatchId: true, winnerEntryId: true, startedAt: true, completedAt: true } },
        entryA: { select: { id: true, teamNameSnapshot: true } },
        entryB: { select: { id: true, teamNameSnapshot: true } }
      },
      orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
      where: { tournamentId: tournament.id }
    });
    return matches.map((match) => ({
      ...this.toMatchSummary(match),
      disputeReason: match.disputeReason,
      lobbyName: match.lobbyName,
      lobbyProofUrl: match.lobbyProofUrl,
      resultEvidenceUrl: match.resultEvidenceUrl,
      resolutionNote: match.resolutionNote
    }));
  }

  async createAdminMatch(
    tournamentSlug: string,
    input: CreateDotaTournamentMatchDto,
    currentUser: AuthenticatedUser
  ) {
    const tournament = await this.prismaService.dotaTournament.findUnique({
      where: { slug: tournamentSlug }
    });
    if (!tournament) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    if (!["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(tournament.status)) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Close registration before scheduling tournament matches",
        statusCode: HttpStatus.CONFLICT
      });
    }
    const entryIds = [input.entryAId, input.entryBId];
    if (input.entryAId === input.entryBId) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "A team cannot play against itself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const entries = await this.prismaService.dotaTournamentEntry.findMany({
      where: { id: { in: entryIds }, status: "REGISTERED", tournamentId: tournament.id }
    });
    if (entries.length !== 2) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Choose two teams registered in this tournament",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Match start time must be in the future",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const match = await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const latestTournament = await tx.dotaTournament.findUnique({ where: { id: tournament.id } });
      if (
        !latestTournament ||
        !["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(latestTournament.status)
      ) {
        throw this.matchConflict(
          "Tournament matches can only be scheduled after registration closes"
        );
      }
      if (latestTournament.automaticBracket) {
        throw this.matchConflict(
          "В автоматическом турнире матчи назначает сетка: запустите турнир"
        );
      }
      const entries = await tx.dotaTournamentEntry.findMany({
        select: { id: true },
        where: {
          id: { in: entryIds },
          status: "REGISTERED",
          tournamentId: tournament.id
        }
      });
      if (entries.length !== 2) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Choose two teams registered in this tournament",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }
      const duplicateNumber = await tx.dotaTournamentMatch.findFirst({
        select: { id: true },
        where: {
          matchNumber: input.matchNumber,
          roundNumber: input.roundNumber,
          tournamentId: tournament.id
        }
      });
      if (duplicateNumber)
        throw this.matchConflict("A match already uses this round and match number");
      const activeMatch = await tx.dotaTournamentMatch.findFirst({
        select: { id: true },
        where: {
          OR: [{ entryAId: { in: entryIds } }, { entryBId: { in: entryIds } }],
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          tournamentId: tournament.id
        }
      });
      if (activeMatch)
        throw this.matchConflict("A team already has an unresolved match in this tournament");

      return tx.dotaTournamentMatch.create({
        data: {
          allowSpectators: latestTournament.allowSpectators,
          cheatsEnabled: latestTournament.cheatsEnabled,
          createdByUserId: currentUser.id,
          entryAId: input.entryAId,
          entryBId: input.entryBId,
          gameMode: latestTournament.gameMode,
          hostSide: input.hostSide,
          bestOf: input.bestOf ?? 1,
          lobbyDeadlineAt: new Date(scheduledAt.getTime() + LOBBY_SETUP_GRACE_MS),
          matchNumber: input.matchNumber,
          roundNumber: input.roundNumber,
          scheduledAt,
          serverRegion: latestTournament.serverRegion,
          streamUrl: input.streamUrl ?? null,
          tournamentId: latestTournament.id
        },
        include: {
          entryA: { select: { id: true, teamNameSnapshot: true } },
          entryB: { select: { id: true, teamNameSnapshot: true } }
        }
      });
    });
    return this.toMatchSummary(match);
  }

  async getPublicMatch(tournamentSlug: string, matchId: string, currentUser?: AuthenticatedUser) {
    const canManageMatch = currentUser?.role === "ADMIN" || currentUser?.role === "TOURNAMENT_MODERATOR";
    const rosterSelect = {
      id: true,
      teamNameSnapshot: true,
      teamParty: { select: { ownerUserId: true } },
      members: {
        where: { isActive: true },
        orderBy: { positionRole: "asc" },
        select: {
          displayName: true,
          dotaProfileSlug: true,
          mmr: true,
          positionRole: true,
          userId: true
        }
      }
    } as const;
    const match = await this.prismaService.dotaTournamentMatch.findFirst({
      where: {
        id: matchId,
        tournament: { slug: tournamentSlug, ...(canManageMatch ? {} : { status: { in: PUBLIC_TOURNAMENT_STATUSES } }) }
      },
      select: {
        id: true,
        bracketKind: true,
        roundNumber: true,
        matchNumber: true,
        scheduledAt: true,
        startedAt: true,
        bestOf: true,
        status: true,
        gameMode: true,
        serverRegion: true,
        allowSpectators: true,
        cheatsEnabled: true,
        hostSide: true,
        streamUrl: true,
        lobbyDeadlineAt: true,
        confirmationDeadlineAt: true,
        captainAReadyAt: true,
        captainBReadyAt: true,
        spectatorAdmissionEndsAt: true,
        resultDeadlineAt: true,
        reportedWinnerEntryId: true,
        winnerEntryId: true,
        games: { orderBy: { gameNumber: "asc" }, select: { gameNumber: true, dotaMatchId: true, winnerEntryId: true, startedAt: true, completedAt: true } },
        tournament: { select: { slug: true, title: true, status: true, finishedAt: true, updatedAt: true } },
        entryA: { select: rosterSelect },
        entryB: { select: rosterSelect }
      }
    });
    if (!match) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament match was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    return {
      ...this.toMatchSummary(match),
      tournament: { slug: match.tournament.slug, title: match.tournament.title },
      isParticipant: !!currentUser && !!this.matchSideForUser(match, currentUser.id),
      canManageMatch,
      canReadChat: (canManageMatch || (!!currentUser && !!this.matchSideForUser(match, currentUser.id))) &&
        (!["COMPLETED", "CANCELLED"].includes(match.tournament.status) ||
          (match.tournament.finishedAt ?? match.tournament.updatedAt).getTime() + TOURNAMENT_AFTERPARTY_MS > Date.now()),
      rosters: {
        A: match.entryA.members.map(({ displayName, dotaProfileSlug, mmr, positionRole }) => ({
          displayName,
          dotaProfileSlug,
          mmr,
          positionRole
        })),
        B: match.entryB.members.map(({ displayName, dotaProfileSlug, mmr, positionRole }) => ({
          displayName,
          dotaProfileSlug,
          mmr,
          positionRole
        }))
      }
    };
  }

  async getStaffMatch(slug: string, matchId: string, user: AuthenticatedUser) {
    if (user.status !== "active" || (user.role !== "ADMIN" && user.role !== "TOURNAMENT_MODERATOR"))
      throw createAppException({ code: AppErrorCode.Forbidden, message: "Tournament management access required", statusCode: HttpStatus.FORBIDDEN });
    const match = await this.findMatchForWorkflow(slug, matchId);
    return { ...this.toMatchSummary(match), disputeReason: match.disputeReason,
      lobbyName: match.lobbyName, lobbyPassword: match.lobbyPassword, lobbyProofUrl: match.lobbyProofUrl,
      resultEvidenceUrl: match.resultEvidenceUrl, resolutionNote: match.resolutionNote,
      resultReporterSide: match.resultReportedByUserId ? this.matchSideForUser(match, match.resultReportedByUserId) : null };
  }

  async submitManagedLobby(
    tournamentSlug: string,
    matchId: string,
    input: SubmitDotaTournamentLobbyDto,
    currentUser: AuthenticatedUser
  ) {
    this.assertTournamentManager(currentUser);
    const lobbyName = input.lobbyName.trim();
    const lobbyPassword = input.lobbyPassword.trim();
    if (!lobbyName || !lobbyPassword) throw this.matchConflict("Lobby name and password are required");

    await this.prismaService.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM social.dota_tournament_matches WHERE id = ${matchId}::uuid FOR UPDATE`;
      const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
      if (!["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(match.tournament.status))
        throw this.matchConflict("The tournament is not in a playable state");
      if (!["SCHEDULED", "LOBBY_CONFIRMATION", "READY", "SPECTATOR_ADMISSION"].includes(match.status))
        throw this.matchConflict("Lobby details can no longer be changed");
      const now = new Date();
      await tx.dotaTournamentMatch.update({
        data: {
          allowSpectators: input.allowSpectators,
          captainAReadyAt: null,
          captainBReadyAt: null,
          cheatsEnabled: input.cheatsEnabled,
          confirmationDeadlineAt: new Date(Math.max(now.getTime(), match.scheduledAt.getTime()) + LOBBY_CONFIRMATION_MS),
          gameMode: input.gameMode,
          lobbyName,
          lobbyPassword,
          lobbyProofUrl: input.lobbyProofUrl ?? null,
          lobbySubmittedAt: now,
          lobbySubmittedByUserId: currentUser.id,
          resultDeadlineAt: null,
          serverRegion: input.serverRegion,
          settingsConfirmedAt: null,
          settingsConfirmedByUserId: null,
          spectatorAdmissionEndsAt: null,
          status: "LOBBY_CONFIRMATION"
        },
        where: { id: match.id }
      });
    });
    return this.getStaffMatch(tournamentSlug, matchId, currentUser);
  }

  async startManagedMatch(tournamentSlug: string, matchId: string, currentUser: AuthenticatedUser) {
    this.assertTournamentManager(currentUser);
    const initial = await this.findMatchForWorkflow(tournamentSlug, matchId);
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      await tx.$queryRaw`SELECT id FROM social.dota_tournament_matches WHERE id = ${matchId}::uuid FOR UPDATE`;
      const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
      if (!["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(match.tournament.status))
        throw this.matchConflict("The tournament is not in a playable state");
      if (!match.lobbyName || !match.lobbyPassword || !match.captainAReadyAt || !match.captainBReadyAt ||
        !["READY", "SPECTATOR_ADMISSION"].includes(match.status))
        throw this.matchConflict("Confirm both teams and save lobby details before starting");

      const now = new Date();
      const updated = await tx.dotaTournamentMatch.updateMany({
        data: { resultDeadlineAt: new Date(now.getTime() + MATCH_DURATION_LIMIT_MS), startedAt: now, status: "IN_PROGRESS" },
        where: { id: match.id, status: { in: ["READY", "SPECTATOR_ADMISSION"] }, captainAReadyAt: { not: null }, captainBReadyAt: { not: null } }
      });
      if (updated.count !== 1) throw this.matchConflict("The match is not ready to start");
      const gameNumber = currentGameNumber(match.games, match.status);
      await tx.dotaTournamentMatchGame.upsert({
        where: { matchId_gameNumber: { matchId, gameNumber } },
        create: { matchId, gameNumber, startedAt: now },
        update: { startedAt: now }
      });
      await tx.dotaTournament.updateMany({ data: { status: "IN_PROGRESS" },
        where: { id: match.tournamentId, status: "REGISTRATION_CLOSED" } });
    });
    return this.getStaffMatch(tournamentSlug, matchId, currentUser);
  }

  async confirmManagedStage(
    tournamentSlug: string,
    matchId: string,
    input: ConfirmDotaTournamentStageDto,
    currentUser: AuthenticatedUser
  ) {
    if (currentUser.status !== "active" || !["ADMIN", "TOURNAMENT_MODERATOR"].includes(currentUser.role))
      throw createAppException({ code: AppErrorCode.Forbidden, message: "Tournament management access required", statusCode: HttpStatus.FORBIDDEN });

    await this.prismaService.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM social.dota_tournament_matches WHERE id = ${matchId}::uuid FOR UPDATE`;
      const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
      const now = new Date();

      if (input.stage === "LOBBY") {
        if (match.status !== "LOBBY_CONFIRMATION")
          throw this.matchConflict("Lobby readiness can no longer be confirmed");
        if ([match.entryA, match.entryB].some((entry) =>
          entry.members.length !== 5 || new Set(entry.members.map((member) => member.positionRole)).size !== 5 ||
          entry.members.some((member) => !TOURNAMENT_ROLES.some((role) => role === member.positionRole))))
          throw this.matchConflict("Both teams must have five players on distinct roles");

        const targetReadyAt = input.side === "A" ? match.captainAReadyAt : match.captainBReadyAt;
        if (targetReadyAt) return;
        const otherReadyAt = input.side === "A" ? match.captainBReadyAt : match.captainAReadyAt;
        const bothReady = !!otherReadyAt;
        const admissionEndsAt = bothReady && match.allowSpectators
          ? new Date(now.getTime() + SPECTATOR_ADMISSION_MS) : null;
        const updated = await tx.dotaTournamentMatch.updateMany({
          where: { id: match.id, status: "LOBBY_CONFIRMATION" },
          data: {
            ...(input.side === "A" ? { captainAReadyAt: now } : { captainBReadyAt: now }),
            ...(bothReady ? {
              confirmationDeadlineAt: new Date(Math.max((admissionEndsAt ?? now).getTime(), match.scheduledAt.getTime()) + LOBBY_SETUP_GRACE_MS),
              settingsConfirmedAt: now,
              settingsConfirmedByUserId: currentUser.id,
              spectatorAdmissionEndsAt: admissionEndsAt,
              status: admissionEndsAt ? "SPECTATOR_ADMISSION" : "READY"
            } : {})
          }
        });
        if (updated.count !== 1) throw this.matchConflict("Lobby readiness can no longer be confirmed");
      } else {
        const reporterSide = match.resultReportedByUserId
          ? this.matchSideForUser(match, match.resultReportedByUserId) : null;
        if (match.status !== "RESULT_CONFIRMATION" || !match.reportedWinnerEntryId ||
          !reporterSide)
          throw this.matchConflict("There is no current game result available for confirmation");
        if (input.side === reporterSide)
          throw this.matchConflict("Confirm the result on behalf of the opposing team");
        await recordSeriesGame(tx, match, match.reportedWinnerEntryId, currentUser.id);
        await this.bracketService.reconcileLocked(tx, match.tournamentId);
      }
    });
    return this.getStaffMatch(tournamentSlug, matchId, currentUser);
  }

  async getParticipantMatch(
    tournamentSlug: string,
    matchId: string,
    currentUser: AuthenticatedUser
  ) {
    let match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const viewerSide = this.matchSideForUser(match, currentUser.id);
    if (!viewerSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only players on either tournament roster can open this match",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    const transition = this.matchDeadlineTransition(match, new Date());
    if (transition) {
      await this.prismaService.dotaTournamentMatch.updateMany({
        where: {
          id: match.id,
          status: match.status,
          lobbyDeadlineAt: match.lobbyDeadlineAt,
          confirmationDeadlineAt: match.confirmationDeadlineAt,
          spectatorAdmissionEndsAt: match.spectatorAdmissionEndsAt,
          resultDeadlineAt: match.resultDeadlineAt
        },
        data: transition
      });
      match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    }
    return {
      ...this.toMatchSummary(match),
      disputeReason: match.disputeReason,
      lobbyName: match.lobbyName,
      lobbyPassword: match.lobbyPassword,
      lobbyProofUrl: match.lobbyProofUrl,
      resultEvidenceUrl: match.resultEvidenceUrl,
      resultReporterSide: match.resultReportedByUserId
        ? this.matchSideForUser(match, match.resultReportedByUserId)
        : null,
      viewerSide,
      canConfirmLobby: this.matchCaptainSideForUser(match, currentUser.id) === viewerSide,
      canManageLobby: this.matchCaptainSideForUser(match, currentUser.id) === match.hostSide,
      canSubmitMatchGameId:
        this.matchCaptainSideForUser(match, currentUser.id) !== null &&
        (match.games.some((game) => game.startedAt && game.winnerEntryId) ||
          match.startedAt !== null && ["RESULT_CONFIRMATION", "DISPUTED", "COMPLETED"].includes(match.status))
    };
  }

  async submitLobby(
    tournamentSlug: string,
    matchId: string,
    input: SubmitDotaTournamentLobbyDto,
    currentUser: AuthenticatedUser
  ) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchCaptainSideForUser(match, currentUser.id);
    if (!actorSide || actorSide !== match.hostSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the assigned host captain can submit lobby details",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    if (match.status !== "SCHEDULED") {
      throw this.matchConflict("Lobby details can no longer be submitted");
    }
    if (
      input.gameMode !== match.gameMode ||
      input.serverRegion !== match.serverRegion ||
      input.allowSpectators !== match.allowSpectators ||
      input.cheatsEnabled !== match.cheatsEnabled
    ) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Lobby settings do not match the tournament rules",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    if (!input.lobbyName.trim() || !input.lobbyPassword.trim()) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Lobby name and password are required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const now = new Date();
    if (match.lobbyDeadlineAt <= now) {
      await this.expireOverdueMatches();
      throw this.matchConflict(
        "The lobby setup deadline passed; an administrator must review this match"
      );
    }
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        confirmationDeadlineAt: new Date(Math.max(now.getTime(), match.scheduledAt.getTime()) + LOBBY_CONFIRMATION_MS),
        lobbyName: input.lobbyName.trim(),
        lobbyPassword: input.lobbyPassword.trim(),
        lobbyProofUrl: input.lobbyProofUrl ?? null,
        lobbySubmittedAt: now,
        lobbySubmittedByUserId: currentUser.id,
        status: "LOBBY_CONFIRMATION"
      },
      where: { id: match.id, lobbyDeadlineAt: { gt: now }, status: "SCHEDULED" }
    });
    if (updated.count !== 1) {
      await this.expireOverdueMatches();
      throw this.matchConflict("Lobby details were already submitted or the setup deadline passed");
    }
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async confirmLobby(
    tournamentSlug: string,
    matchId: string,
    input: ConfirmDotaTournamentLobbyDto,
    currentUser: AuthenticatedUser
  ) {
    if (input.playersReady !== true)
      throw this.matchConflict("Confirm that all five players are in the lobby");
    await this.prismaService.$transaction(async (tx) => {
      // Serialize the two captains and duplicate clicks on this match only.
      await tx.$queryRaw`SELECT id FROM social.dota_tournament_matches WHERE id = ${matchId}::uuid FOR UPDATE`;
      const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
      const actorSide = this.matchCaptainSideForUser(match, currentUser.id);
      if (!actorSide) {
        throw createAppException({
          code: AppErrorCode.Forbidden,
          message: "Only the team captains can confirm lobby settings and player readiness",
          statusCode: HttpStatus.FORBIDDEN
        });
      }
      const ownReadyAt = actorSide === "A" ? match.captainAReadyAt : match.captainBReadyAt;
      if (
        ownReadyAt &&
        ["LOBBY_CONFIRMATION", "SPECTATOR_ADMISSION", "READY"].includes(match.status)
      )
        return;
      const now = new Date();
      if (
        match.status !== "LOBBY_CONFIRMATION" ||
        !match.confirmationDeadlineAt ||
        match.confirmationDeadlineAt <= now
      ) {
        throw this.matchConflict("Lobby confirmation is no longer available");
      }
      if (
        [match.entryA, match.entryB].some(
          (entry) =>
            entry.members.length !== 5 ||
            new Set(entry.members.map((member) => member.positionRole)).size !== 5 ||
            entry.members.some(
              (member) => !TOURNAMENT_ROLES.some((role) => role === member.positionRole)
            )
        )
      )
        throw this.matchConflict("Both teams must have five players on distinct roles");
      const bothReady = !!(actorSide === "A" ? match.captainBReadyAt : match.captainAReadyAt);
      const admissionEndsAt =
        bothReady && match.allowSpectators
          ? new Date(now.getTime() + SPECTATOR_ADMISSION_MS)
          : null;
      const updated = await tx.dotaTournamentMatch.updateMany({
        where: { id: match.id, status: "LOBBY_CONFIRMATION", confirmationDeadlineAt: { gt: now } },
        data: {
          ...(actorSide === "A" ? { captainAReadyAt: now } : { captainBReadyAt: now }),
          ...(bothReady
            ? {
                confirmationDeadlineAt: new Date(
                  Math.max((admissionEndsAt ?? now).getTime(), match.scheduledAt.getTime()) + LOBBY_SETUP_GRACE_MS
                ),
                settingsConfirmedAt: now,
                settingsConfirmedByUserId: currentUser.id,
                spectatorAdmissionEndsAt: admissionEndsAt,
                status: admissionEndsAt ? "SPECTATOR_ADMISSION" : "READY"
              }
            : {})
        }
      });
      if (updated.count !== 1)
        throw this.matchConflict("Lobby confirmation is no longer available");
    });
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async startMatch(tournamentSlug: string, matchId: string, currentUser: AuthenticatedUser) {
    const initial = await this.findMatchForWorkflow(tournamentSlug, matchId);
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
      const actorSide = this.matchCaptainSideForUser(match, currentUser.id);
      if (!actorSide || actorSide !== match.hostSide) {
        throw createAppException({ code: AppErrorCode.Forbidden, message: "Only the host captain can start the game", statusCode: HttpStatus.FORBIDDEN });
      }
      const now = new Date();
      if (match.scheduledAt > now) throw this.matchConflict("The scheduled start time has not arrived");
      const updated = await tx.dotaTournamentMatch.updateMany({
        data: { resultDeadlineAt: new Date(now.getTime() + MATCH_DURATION_LIMIT_MS), startedAt: now, status: "IN_PROGRESS" },
        where: { id: matchId, confirmationDeadlineAt: { gt: now },
          status: { in: ["READY", "SPECTATOR_ADMISSION"] }, captainAReadyAt: { not: null }, captainBReadyAt: { not: null },
          OR: [{ spectatorAdmissionEndsAt: null }, { spectatorAdmissionEndsAt: { lte: now } }] }
      });
      if (updated.count !== 1) throw this.matchConflict("The match is not ready to start");
      const gameNumber = currentGameNumber(match.games, match.status);
      await tx.dotaTournamentMatchGame.upsert({
        where: { matchId_gameNumber: { matchId, gameNumber } },
        create: { matchId, gameNumber, startedAt: now }, update: { startedAt: now }
      });
      await tx.dotaTournament.updateMany({ data: { status: "IN_PROGRESS" },
        where: { id: match.tournamentId, status: "REGISTRATION_CLOSED" } });
    });
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async submitMatchGameId(tournamentSlug: string, matchId: string, input: SubmitDotaTournamentMatchGameDto, currentUser: AuthenticatedUser) {
    return this.saveMatchGameId(tournamentSlug, matchId, input, currentUser, false);
  }

  async submitManagedMatchGameId(tournamentSlug: string, matchId: string, input: SubmitDotaTournamentMatchGameDto, currentUser: AuthenticatedUser) {
    this.assertTournamentManager(currentUser);
    return this.saveMatchGameId(tournamentSlug, matchId, input, currentUser, true);
  }

  private async saveMatchGameId(
    tournamentSlug: string,
    matchId: string,
    input: SubmitDotaTournamentMatchGameDto,
    currentUser: AuthenticatedUser,
    isManager: boolean
  ) {
    const initial = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const dotaMatchId = input.dotaMatchId.trim();
    try {
      await this.prismaService.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
        const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
        if (!isManager && !this.matchCaptainSideForUser(match, currentUser.id))
          throw createAppException({ code: AppErrorCode.Forbidden, message: "Only a captain can save a game ID", statusCode: HttpStatus.FORBIDDEN });
        const currentNumber = currentGameNumber(match.games, match.status);
        const gameNumber = input.gameNumber ?? currentNumber;
        const game = match.games.find((item) => item.gameNumber === gameNumber);
        const currentEnded = gameNumber === currentNumber && match.startedAt !== null &&
          ["RESULT_CONFIRMATION", "DISPUTED", "COMPLETED"].includes(match.status);
        if (!(game?.startedAt && game.winnerEntryId) && !currentEnded)
          throw this.matchConflict("A Dota ID can be saved only for a played, ended game");
        const existing = await tx.dotaTournamentMatchGame.findUnique({ where: { dotaMatchId }, select: { matchId: true, gameNumber: true } });
        if (existing && (existing.matchId !== match.id || existing.gameNumber !== gameNumber))
          throw this.matchConflict("This Dota ID belongs to another game");
        await tx.dotaTournamentMatchGame.upsert({
          where: { matchId_gameNumber: { matchId, gameNumber } },
          create: { dotaMatchId, matchId, gameNumber, startedAt: match.startedAt },
          update: { dotaMatchId }
        });
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002")
        throw this.matchConflict("This Dota ID belongs to another game");
      throw error;
    }
    return isManager
      ? this.getStaffMatch(tournamentSlug, matchId, currentUser)
      : this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async submitResult(
    tournamentSlug: string,
    matchId: string,
    input: SubmitDotaTournamentResultDto,
    currentUser: AuthenticatedUser
  ) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchSideForUser(match, currentUser.id);
    if (!actorSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only players on either tournament roster can report this result",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    if (![match.entryAId, match.entryBId].includes(input.winnerEntryId)) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "The reported winner must be one of the teams in this match",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    if (match.status !== "IN_PROGRESS")
      throw this.matchConflict("This match is not accepting a result");
    const now = new Date();
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        confirmationDeadlineAt: new Date(now.getTime() + MATCH_RESULT_CONFIRMATION_MS),
        reportedWinnerEntryId: input.winnerEntryId,
        resultDeadlineAt: new Date(now.getTime() + MATCH_RESULT_CONFIRMATION_MS),
        resultEvidenceUrl: input.evidenceUrl ?? null,
        resultReportedAt: now,
        resultReportedByUserId: currentUser.id,
        status: "RESULT_CONFIRMATION"
      },
      where: {
        id: match.id,
        resultDeadlineAt: { gt: now },
        status: "IN_PROGRESS"
      }
    });
    if (updated.count !== 1) {
      await this.expireOverdueMatches();
      throw this.matchConflict(
        "The result deadline passed or another result was already submitted"
      );
    }
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async confirmResult(tournamentSlug: string, matchId: string, currentUser: AuthenticatedUser) {
    const initial = await this.findMatchForWorkflow(tournamentSlug, matchId);
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const match = await this.findMatchForWorkflow(tournamentSlug, matchId, tx);
      const actorSide = this.matchSideForUser(match, currentUser.id);
      const reporterSide = match.resultReportedByUserId ? this.matchSideForUser(match, match.resultReportedByUserId) : null;
      if (!actorSide || !reporterSide || actorSide === reporterSide)
        throw createAppException({ code: AppErrorCode.Forbidden, message: "The opposing team must confirm the result", statusCode: HttpStatus.FORBIDDEN });
      if (match.status !== "RESULT_CONFIRMATION" || !match.reportedWinnerEntryId ||
        !match.resultDeadlineAt || match.resultDeadlineAt <= new Date())
        throw this.matchConflict("There is no current game result available for confirmation");
      await recordSeriesGame(tx, match, match.reportedWinnerEntryId, currentUser.id);
      await this.bracketService.reconcileLocked(tx, match.tournamentId);
    });
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async disputeMatch(
    tournamentSlug: string,
    matchId: string,
    input: DisputeDotaTournamentMatchDto,
    currentUser: AuthenticatedUser
  ) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchSideForUser(match, currentUser.id);
    const reporterSide = match.resultReportedByUserId
      ? this.matchSideForUser(match, match.resultReportedByUserId)
      : null;
    const mayDisputeLobby = ["LOBBY_CONFIRMATION", "SPECTATOR_ADMISSION", "READY"].includes(
      match.status
    );
    const mayDisputeResult = match.status === "RESULT_CONFIRMATION" && actorSide !== reporterSide;
    if (!actorSide || (!mayDisputeLobby && !mayDisputeResult)) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the other team can dispute these details",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    const reason = input.reason.trim();
    if (!reason) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Describe what is wrong",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: { disputeReason: reason, status: "DISPUTED" },
      where: { id: match.id, status: match.status }
    });
    if (updated.count !== 1)
      throw this.matchConflict("The match changed while you were reporting the issue");
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async replaceMatchSideWithReserve(
    tournamentSlug: string,
    matchId: string,
    input: ReplaceTournamentMatchSideDto,
    currentUser: AuthenticatedUser
  ) {
    if (currentUser.status !== "active" ||
      (currentUser.role !== "ADMIN" && currentUser.role !== "TOURNAMENT_MODERATOR")) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Tournament management access required",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const initial = await this.prismaService.dotaTournamentMatch.findFirst({
      select: { id: true, tournamentId: true },
      where: { id: matchId, tournament: { slug: tournamentSlug } }
    });
    if (!initial) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament match was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    let replacedEntryId = "";
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${initial.tournamentId}`}))`;
      const tournament = await tx.dotaTournament.findUniqueOrThrow({
        select: { bracketGeneratedAt: true, id: true, status: true },
        where: { id: initial.tournamentId }
      });
      if (!["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(tournament.status)) {
        throw this.matchConflict("Close tournament registration before assigning a reserve team");
      }

      const match = await tx.dotaTournamentMatch.findFirst({
        include: { games: true },
        where: { id: matchId, tournamentId: tournament.id }
      });
      if (!match) throw this.matchConflict("The match no longer exists");
      if (
        !["SCHEDULED", "DISPUTED"].includes(match.status) ||
        match.startedAt ||
        match.games.length > 0
      ) {
        throw this.matchConflict("A reserve team can replace a lineup only before the match starts");
      }
      const replacementAt = new Date();
      if (match.scheduledAt > replacementAt) {
        throw this.matchConflict("Wait until the scheduled match time before assigning a reserve team");
      }

      replacedEntryId = input.side === "A" ? match.entryAId : match.entryBId;
      const reserve = await tx.dotaTournamentEntry.findFirst({
        include: { members: { where: { isActive: true } } },
        where: {
          id: input.reserveEntryId,
          status: "RESERVE",
          tournamentId: tournament.id
        }
      });
      if (!reserve || !this.hasCompleteRoleLineup(reserve.members)) {
        throw this.matchConflict("Choose a reserve squad with five players in different roles");
      }
      if (reserve.id === match.entryAId || reserve.id === match.entryBId) {
        throw this.matchConflict("This reserve squad is already assigned to the match");
      }

      const existingReserveMatches = await tx.dotaTournamentMatch.count({
        where: {
          tournamentId: tournament.id,
          OR: [{ entryAId: reserve.id }, { entryBId: reserve.id }]
        }
      });
      if (existingReserveMatches) {
        throw this.matchConflict("This reserve squad has already been assigned to a match");
      }

      const playedMatches = await tx.dotaTournamentMatch.count({
        where: {
          id: { not: match.id },
          tournamentId: tournament.id,
          AND: [
            { OR: [{ entryAId: replacedEntryId }, { entryBId: replacedEntryId }] },
            {
              OR: [
                { status: { notIn: ["SCHEDULED", "CANCELLED"] } },
                { startedAt: { not: null } },
                { games: { some: {} } }
              ]
            }
          ]
        }
      });
      if (playedMatches) {
        throw this.matchConflict("A reserve can replace a team only before that team's first match");
      }
      const otherAssignedMatches = await tx.dotaTournamentMatch.count({
        where: {
          id: { not: match.id },
          tournamentId: tournament.id,
          status: { not: "CANCELLED" },
          OR: [{ entryAId: replacedEntryId }, { entryBId: replacedEntryId }]
        }
      });
      if (otherAssignedMatches) {
        throw this.matchConflict("Resolve or remove the team's other scheduled match before replacing it");
      }

      const incumbent = await tx.dotaTournamentEntry.findFirst({
        select: { id: true, status: true },
        where: { id: replacedEntryId, tournamentId: tournament.id }
      });
      if (!incumbent || incumbent.status !== "REGISTERED") {
        throw this.matchConflict("Only a registered team can be replaced by a reserve");
      }

      const averageMmr = reserve.members.every((member) => member.mmr !== null)
        ? reserve.members.reduce((sum, member) => sum + (member.mmr ?? 0), 0) / reserve.members.length
        : null;
      const seed = await tx.dotaTournamentBracketSeed.findUnique({
        where: { entryId: replacedEntryId }
      });

      await tx.dotaTournamentEntry.update({
        data: { status: "DISQUALIFIED" },
        where: { id: replacedEntryId }
      });
      await tx.dotaTournamentEntry.update({
        data: { status: "REGISTERED" },
        where: { id: reserve.id }
      });
      await tx.dotaTournamentMatch.update({
        data: {
          ...(input.side === "A" ? { entryAId: reserve.id } : { entryBId: reserve.id }),
          captainAReadyAt: null,
          captainBReadyAt: null,
          confirmationDeadlineAt: null,
          disputeReason: null,
          lobbyDeadlineAt: new Date(replacementAt.getTime() + LOBBY_SETUP_GRACE_MS),
          lobbyName: null,
          lobbyPassword: null,
          lobbyProofUrl: null,
          lobbySubmittedAt: null,
          lobbySubmittedByUserId: null,
          reportedWinnerEntryId: null,
          resultConfirmedAt: null,
          resultConfirmedByUserId: null,
          resultDeadlineAt: null,
          resultEvidenceUrl: null,
          resultReportedAt: null,
          resultReportedByUserId: null,
          resolutionNote: null,
          resolvedAt: null,
          resolvedByUserId: null,
          settingsConfirmedAt: null,
          settingsConfirmedByUserId: null,
          spectatorAdmissionEndsAt: null,
          scheduledAt: replacementAt,
          startedAt: null,
          status: "SCHEDULED",
          winnerEntryId: null
        },
        where: { id: match.id }
      });
      if (seed) {
        await tx.dotaTournamentBracketSeed.update({
          data: { entryId: reserve.id, averageMmr },
          where: { id: seed.id }
        });
      }
    });

    if (replacedEntryId) await this.roomsService?.syncAccess(replacedEntryId);
    this.roomsService?.notifyChanged(input.reserveEntryId);
    const updated = await this.prismaService.dotaTournamentMatch.findUniqueOrThrow({
      include: {
        games: { orderBy: { gameNumber: "asc" }, select: { gameNumber: true, dotaMatchId: true, winnerEntryId: true, startedAt: true, completedAt: true } },
        entryA: { select: { id: true, teamNameSnapshot: true } },
        entryB: { select: { id: true, teamNameSnapshot: true } }
      },
      where: { id: matchId }
    });
    return this.toMatchSummary(updated);
  }

  async resolveAdminMatch(matchId: string, input: ResolveDotaTournamentMatchDto, currentUser: AuthenticatedUser) {
    if (currentUser.status !== "active" || (currentUser.role !== "ADMIN" && currentUser.role !== "TOURNAMENT_MODERATOR"))
      throw createAppException({ code: AppErrorCode.Forbidden, message: "Tournament management access required", statusCode: HttpStatus.FORBIDDEN });
    const initial = await this.prismaService.dotaTournamentMatch.findUnique({ where: { id: matchId } });
    if (!initial) throw createAppException({ code: AppErrorCode.NotFound, message: "Match was not found", statusCode: HttpStatus.NOT_FOUND });
    if (!input.note.trim()) throw this.matchConflict("Describe the decision");
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const match = await tx.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId }, include: { games: true } });
      const liveGameDecision = ["IN_PROGRESS", "RESULT_CONFIRMATION"].includes(match.status) &&
        ["ENTRY_A", "ENTRY_B"].includes(input.resolution);
      const seriesTechnicalDecision = ["ENTRY_A_SERIES", "ENTRY_B_SERIES"].includes(input.resolution);
      const technicalSeriesDecision = seriesTechnicalDecision &&
        !["COMPLETED", "CANCELLED"].includes(match.status);
      if (match.status !== "DISPUTED" && !liveGameDecision && !technicalSeriesDecision)
        throw this.matchConflict("Only unfinished matches can be resolved");
      if (liveGameDecision && !["ENTRY_A", "ENTRY_B"].includes(input.resolution))
        throw this.matchConflict("Only a single game winner can be set for an active match");
      if (input.resolution === "CANCEL" && match.bracketKind !== "MANUAL")
        throw this.matchConflict("Use a game winner or replay; only the whole tournament can be cancelled");
      const now = new Date();
      if (input.resolution === "REPLAY") {
        await tx.dotaTournamentMatchGame.deleteMany({ where: { matchId, gameNumber: currentGameNumber(match.games, match.status), winnerEntryId: null } });
        const replayAt = match.games.length === 0 && match.scheduledAt > now ? match.scheduledAt : now;
        await tx.dotaTournamentMatch.update({ where: { id: matchId },
          data: { ...nextGameState(replayAt), resolutionNote: input.note.trim(), resolvedAt: now, resolvedByUserId: currentUser.id } });
      } else if (input.resolution === "ENTRY_A_SERIES" || input.resolution === "ENTRY_B_SERIES") {
        await tx.dotaTournamentMatch.update({ where: { id: matchId }, data: {
          status: "COMPLETED", winnerEntryId: input.resolution === "ENTRY_A_SERIES" ? match.entryAId : match.entryBId,
          disputeReason: null, resolutionNote: input.note.trim(), resolvedAt: now, resolvedByUserId: currentUser.id,
          resultConfirmedAt: now, resultConfirmedByUserId: currentUser.id
        } });
      } else if (input.resolution === "CANCEL") {
        await tx.dotaTournamentMatch.update({ where: { id: matchId },
          data: { status: "CANCELLED", resolutionNote: input.note.trim(), resolvedAt: now, resolvedByUserId: currentUser.id } });
      } else {
        await recordSeriesGame(tx, match, input.resolution === "ENTRY_A" ? match.entryAId : match.entryBId,
          currentUser.id, input.note.trim());
      }
      await this.bracketService.reconcileLocked(tx, match.tournamentId);
    });
    const resolved = await this.prismaService.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId }, include: {
      games: true, entryA: { select: { id: true, teamNameSnapshot: true } }, entryB: { select: { id: true, teamNameSnapshot: true } }
    } });
    return this.toMatchSummary(resolved);
  }

  async registerTeam(
    tournamentSlug: string,
    input: RegisterDotaTournamentTeamDto,
    currentUser: AuthenticatedUser
  ) {
    const [tournament, team] = await Promise.all([
      this.prismaService.dotaTournament.findUnique({ where: { slug: tournamentSlug } }),
      this.gamePartiesService.getPartyBySlug(input.teamSlug, currentUser.id)
    ]);

    if (!tournament || !PUBLIC_TOURNAMENT_STATUSES.includes(tournament.status)) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (team.vertical !== DOTA_PARTY_VERTICAL || team.kind !== "TEAM" || !team.isOwner) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain of a Dota team can register it",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    if (team.members.length === 0) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "A team must have at least one member",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (!team.members.some((member) => member.userId === currentUser.id)) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "The captain must be a member of the team",
        statusCode: HttpStatus.CONFLICT
      });
    }
    if (!this.hasUniqueAssignedRoles(team.members)) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "A tournament lineup cannot assign the same position more than once",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const now = new Date();
    if (
      tournament.status !== "REGISTRATION_OPEN" ||
      (tournament.registrationClosesAt && tournament.registrationClosesAt <= now)
    ) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Tournament registration is closed",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const memberIds = team.members.map((member) => member.userId);
    try {
      await this.prismaService.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;

        const currentTournament = await tx.dotaTournament.findUnique({
          where: { id: tournament.id }
        });
        if (
          !currentTournament ||
          currentTournament.status !== "REGISTRATION_OPEN" ||
          (currentTournament.registrationClosesAt &&
            currentTournament.registrationClosesAt <= new Date())
        ) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "Tournament registration is closed",
            statusCode: HttpStatus.CONFLICT
          });
        }

        const existing = await tx.dotaTournamentEntry.findUnique({
          where: {
            tournamentId_teamPartyId: {
              teamPartyId: team.id,
              tournamentId: tournament.id
            }
          }
        });
        if (existing && this.isActiveEntryStatus(existing.status)) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This team is already registered for the tournament",
            statusCode: HttpStatus.CONFLICT
          });
        }

        const occupiedMembers = await tx.dotaTournamentEntryMember.findMany({
          select: { entryId: true, userId: true },
          where: {
            isActive: true,
            tournamentId: tournament.id,
            userId: { in: memberIds }
          }
        });
        if (occupiedMembers.some((member) => member.entryId !== existing?.id)) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "A player is already registered with another team in this tournament",
            statusCode: HttpStatus.CONFLICT
          });
        }

        const entry = existing
          ? await tx.dotaTournamentEntry.update({
              data: {
                createdByUserId: currentUser.id,
                joinMode: input.joinMode ?? "CONFIRM",
                status: "RECRUITING",
                teamNameSnapshot: team.name,
                teamSlugSnapshot: team.slug
              },
              where: { id: existing.id }
            })
          : await tx.dotaTournamentEntry.create({
              data: {
                createdByUserId: currentUser.id,
                joinMode: input.joinMode ?? "CONFIRM",
                status: "RECRUITING",
                teamNameSnapshot: team.name,
                teamPartyId: team.id,
                teamSlugSnapshot: team.slug,
                tournamentId: tournament.id
              }
            });

        await tx.dotaTournamentEntryMember.updateMany({
          data: { isActive: false },
          where: { entryId: entry.id }
        });

        await tx.dotaTournamentRoom.updateMany({ where: { entryId: entry.id }, data: { expiresAt: null } });
        for (const member of team.members) {
          const parsedMmr = member.mmr ? Number.parseInt(member.mmr, 10) : Number.NaN;
          await tx.dotaTournamentEntryMember.upsert({
            create: {
              displayName: member.displayName.slice(0, 80),
              dotaProfileSlug: member.dotaSlug,
              entryId: entry.id,
              isActive: true,
              mmr: Number.isFinite(parsedMmr) ? parsedMmr : null,
              positionRole: member.positionRole,
              tournamentId: tournament.id,
              userId: member.userId
            },
            update: {
              displayName: member.displayName.slice(0, 80),
              dotaProfileSlug: member.dotaSlug,
              isActive: true,
              roomLeftAt: null,
              mmr: Number.isFinite(parsedMmr) ? parsedMmr : null,
              positionRole: member.positionRole
            },
            where: {
              entryId_userId: { entryId: entry.id, userId: member.userId }
            }
          });
        }
        await this.syncEntryRegistrationStatus(tx, entry.id);
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "A player is already registered with another team in this tournament",
          statusCode: HttpStatus.CONFLICT
        });
      }
      throw error;
    }

    return this.getPublic(tournamentSlug);
  }

  async withdrawTeam(tournamentSlug: string, entryId: string, currentUser: AuthenticatedUser) {
    const entry = await this.prismaService.dotaTournamentEntry.findFirst({
      include: { teamParty: { select: { ownerUserId: true } }, tournament: true },
      where: { id: entryId, tournament: { slug: tournamentSlug } }
    });
    if (!entry) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament entry was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    const isCaptain = (entry.createdByUserId ?? entry.teamParty?.ownerUserId) === currentUser.id;
    if (!isCaptain) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the team captain can withdraw its entry",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    this.assertEntryCanRecruit(entry.tournament, entry.status);

    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${entry.tournamentId}`}))`;
      const latest = await tx.dotaTournamentEntry.findFirst({
        include: { tournament: true, teamParty: { select: { ownerUserId: true } } },
        where: { id: entry.id, tournament: { slug: tournamentSlug } }
      });
      if (!latest || !this.isActiveEntryStatus(latest.status)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This team is no longer registered for the tournament",
          statusCode: HttpStatus.CONFLICT
        });
      }
      this.assertEntryCanRecruit(latest.tournament, latest.status);
      if ((latest.createdByUserId ?? latest.teamParty?.ownerUserId) !== currentUser.id) {
        throw this.matchConflict("The tournament team captain has changed");
      }
      await tx.dotaTournamentEntry.update({
        data: { status: "WITHDRAWN" },
        where: { id: entry.id }
      });
      await tx.dotaTournamentEntryMember.updateMany({
        data: { isActive: false },
        where: { entryId: entry.id }
      });
      await tx.dotaTournamentEntryRequest.updateMany({
        data: { status: "WITHDRAWN" },
        where: { entryId: entry.id, status: "PENDING" }
      });
      await tx.dotaTournamentRoom.updateMany({
        where: { entryId: entry.id }, data: { expiresAt: new Date() }
      });
    });

    await this.roomsService?.syncAccess(entryId);
    return this.getPublic(tournamentSlug);
  }

  listForAdmin() {
    return this.prismaService.dotaTournament
      .findMany({
        include: { _count: { select: { entries: { where: { status: "REGISTERED" } } } } },
        orderBy: [{ createdAt: "desc" }]
      })
      .then((items) => items.map((item) => this.toTournamentSummary(item)));
  }

  async create(input: CreateDotaTournamentDto, currentUser: AuthenticatedUser) {
    if (input.automaticBracket === false && input.bracketFormat === "DOUBLE_ELIMINATION")
      throw this.matchConflict("Double elimination requires an automatic bracket");
    if (
      input.automaticBracket !== false &&
      ["IN_PROGRESS", "COMPLETED"].includes(input.status ?? "DRAFT")
    ) {
      throw this.matchConflict(
        "Сначала откройте регистрацию и наберите команды, затем запустите турнир"
      );
    }
    const title = input.title.trim();
    if (!title) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Tournament title is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const baseSlug = this.slugify(input.slug?.trim() || title);
    const slug = baseSlug || `tournament-${Date.now()}`;
    const existing = await this.prismaService.dotaTournament.findUnique({ where: { slug } });
    if (existing) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Tournament URL is already in use",
        statusCode: HttpStatus.CONFLICT
      });
    }

    return this.toTournamentSummary(
      await this.prismaService.dotaTournament.create({
        data: {
          createdByUserId: currentUser.id,
          automaticBracket: input.automaticBracket ?? true,
          bracketFormat: input.bracketFormat ?? "SINGLE_ELIMINATION",
          allowSpectators: input.allowSpectators ?? false,
          cheatsEnabled: input.cheatsEnabled ?? false,
          description: input.description?.trim() ?? "",
          format: input.format?.trim() || null,
          gameMode: input.gameMode ?? "ALL_PICK",
          maxTeams: input.maxTeams ?? null,
          registrationClosesAt: input.registrationClosesAt
            ? new Date(input.registrationClosesAt)
            : null,
          rulesUrl: input.rulesUrl ?? null,
          serverRegion: input.serverRegion ?? "EUROPE",
          slug,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          status: input.status ?? "DRAFT",
          finishedAt: ["COMPLETED", "CANCELLED"].includes(input.status ?? "DRAFT") ? new Date() : null,
          title
        }
      })
    );
  }

  async update(slug: string, input: UpdateDotaTournamentDto) {
    const current = await this.prismaService.dotaTournament.findUnique({ where: { slug } });
    if (!current) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    const nextSlug = input.slug == null ? current.slug : this.slugify(input.slug) || current.slug;
    if (nextSlug !== current.slug) {
      const collision = await this.prismaService.dotaTournament.findUnique({
        where: { slug: nextSlug }
      });
      if (collision) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Tournament URL is already in use",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }
    const updated = await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${current.id}`}))`;
      const latest = await tx.dotaTournament.findUnique({ where: { id: current.id } });
      if (!latest) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Tournament was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }
      const configurationFields = [
        "automaticBracket",
        "bracketFormat",
        "title",
        "slug",
        "description",
        "format",
        "rulesUrl",
        "startsAt",
        "registrationClosesAt",
        "maxTeams",
        "gameMode",
        "serverRegion",
        "allowSpectators",
        "cheatsEnabled"
      ] as const;
      if (latest.finishedAt && input.status && input.status !== latest.status) {
        throw this.matchConflict("A finished tournament cannot be reopened");
      }
      const changesConfiguration = configurationFields.some((field) => input[field] !== undefined);
      const hasStartedMatch = await tx.dotaTournamentMatch.count({
        where: {
          tournamentId: latest.id,
          status: { notIn: ["SCHEDULED", "CANCELLED"] }
        }
      });
      if (
        changesConfiguration &&
        (Boolean(latest.bracketGeneratedAt) ||
          ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(latest.status) ||
          hasStartedMatch > 0)
      ) {
        throw this.matchConflict("Параметры турнира можно менять только до его старта");
      }
      if (
        latest.bracketGeneratedAt &&
        (input.automaticBracket === false ||
          (input.status &&
            ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(input.status)) ||
          (input.status === "COMPLETED" && latest.status !== "COMPLETED") ||
          (input.status === "IN_PROGRESS" && latest.status !== "IN_PROGRESS") ||
          (input.gameMode !== undefined && input.gameMode !== latest.gameMode) ||
          (input.serverRegion !== undefined && input.serverRegion !== latest.serverRegion) ||
          (input.allowSpectators !== undefined &&
            input.allowSpectators !== latest.allowSpectators) ||
          (input.cheatsEnabled !== undefined && input.cheatsEnabled !== latest.cheatsEnabled))
      )
        throw this.matchConflict(
          "Сетка уже зафиксирована: результат определяется матчами, настройки менять нельзя"
        );
      const automaticBracket = input.automaticBracket ?? latest.automaticBracket;
      const bracketFormat = input.bracketFormat ?? latest.bracketFormat;
      if (!automaticBracket && bracketFormat === "DOUBLE_ELIMINATION")
        throw this.matchConflict("Double elimination requires an automatic bracket");
      if (
        automaticBracket &&
        !latest.bracketGeneratedAt &&
        !latest.automaticBracket &&
        (await tx.dotaTournamentMatch.count({ where: { tournamentId: latest.id } }))
      ) {
        throw this.matchConflict("В турнире уже есть ручные матчи: режим сетки менять нельзя");
      }
      if (input.maxTeams !== undefined && input.maxTeams !== null) {
        const registeredTeams = await tx.dotaTournamentEntry.count({
          where: { status: "REGISTERED", tournamentId: latest.id }
        });
        if (input.maxTeams < registeredTeams) {
          throw this.matchConflict(
            `Лимит команд не может быть меньше уже зарегистрированного состава (${registeredTeams})`
          );
        }
      }
      if (automaticBracket && input.status === "COMPLETED" && !latest.bracketGeneratedAt) {
        throw this.matchConflict("Завершите матчи сетки перед завершением турнира");
      }
      const result = await tx.dotaTournament.update({
        data: {
          automaticBracket,
          bracketFormat,
          description: input.description?.trim() ?? latest.description,
          allowSpectators: input.allowSpectators ?? latest.allowSpectators,
          cheatsEnabled: input.cheatsEnabled ?? latest.cheatsEnabled,
          format: input.format === undefined ? latest.format : input.format?.trim() || null,
          gameMode: input.gameMode ?? latest.gameMode,
          maxTeams: input.maxTeams === undefined ? latest.maxTeams : input.maxTeams,
          registrationClosesAt:
            input.registrationClosesAt === undefined
              ? latest.registrationClosesAt
              : input.registrationClosesAt
                ? new Date(input.registrationClosesAt)
                : null,
          rulesUrl: input.rulesUrl === undefined ? latest.rulesUrl : input.rulesUrl || null,
          serverRegion: input.serverRegion ?? latest.serverRegion,
          slug: nextSlug,
          startsAt:
            input.startsAt === undefined
              ? latest.startsAt
              : input.startsAt
                ? new Date(input.startsAt)
                : null,
          status: input.status ?? latest.status,
          finishedAt: latest.finishedAt ??
            (["COMPLETED", "CANCELLED"].includes(input.status ?? latest.status) ? new Date() : null),
          title: input.title?.trim() || latest.title
        },
        where: { id: current.id }
      });
      if (
        input.gameMode !== undefined ||
        input.serverRegion !== undefined ||
        input.allowSpectators !== undefined ||
        input.cheatsEnabled !== undefined
      ) {
        await tx.dotaTournamentMatch.updateMany({
          where: { tournamentId: latest.id, status: "SCHEDULED" },
          data: {
            allowSpectators: result.allowSpectators,
            cheatsEnabled: result.cheatsEnabled,
            gameMode: result.gameMode,
            serverRegion: result.serverRegion
          }
        });
      }
      if (
        (result.status === "REGISTRATION_CLOSED" || result.status === "IN_PROGRESS") &&
        latest.status !== "REGISTRATION_CLOSED" && latest.status !== "IN_PROGRESS"
      ) {
        await tx.dotaTournamentEntry.updateMany({
          data: { status: "RESERVE" },
          where: { tournamentId: latest.id, status: "RECRUITING" }
        });
      }
      if (automaticBracket && result.status === "IN_PROGRESS") {
        await this.bracketService.startLocked(tx, current.id);
        return tx.dotaTournament.findUniqueOrThrow({ where: { id: current.id } });
      }
      if (latest.bracketGeneratedAt && result.status === "CANCELLED") {
        await tx.dotaTournamentMatch.updateMany({
          where: { tournamentId: latest.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          data: { status: "CANCELLED" }
        });
      }
      if (result.finishedAt) {
        await tx.dotaTournamentRoom.updateMany({
          where: { entry: { tournamentId: result.id }, expiresAt: null },
          data: { expiresAt: new Date(result.finishedAt.getTime() + TOURNAMENT_AFTERPARTY_MS) }
        });
      }
      return result;
    });
    return this.toTournamentSummary(updated);
  }

  private async findMatchForWorkflow(
    tournamentSlug: string,
    matchId: string,
    client: PrismaService | Prisma.TransactionClient = this.prismaService
  ) {
    const match = await client.dotaTournamentMatch.findFirst({
      include: {
        games: { orderBy: { gameNumber: "asc" }, select: { gameNumber: true, dotaMatchId: true, winnerEntryId: true, startedAt: true, completedAt: true } },
        entryA: {
          include: {
            members: { select: { userId: true, positionRole: true }, where: { isActive: true } },
            teamParty: { select: { ownerUserId: true } }
          }
        },
        entryB: {
          include: {
            members: { select: { userId: true, positionRole: true }, where: { isActive: true } },
            teamParty: { select: { ownerUserId: true } }
          }
        },
        tournament: { select: { slug: true, title: true, status: true } }
      },
      where: { id: matchId, tournament: { slug: tournamentSlug } }
    });
    if (!match) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament match was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    return match;
  }

  private matchCaptainSideForUser(
    match: {
      entryA: { createdByUserId: string | null; teamParty: { ownerUserId: string } | null };
      entryB: { createdByUserId: string | null; teamParty: { ownerUserId: string } | null };
    },
    userId: string
  ): MatchSide | null {
    if ((match.entryA.createdByUserId ?? match.entryA.teamParty?.ownerUserId) === userId)
      return "A";
    if ((match.entryB.createdByUserId ?? match.entryB.teamParty?.ownerUserId) === userId)
      return "B";
    return null;
  }

  private matchSideForUser(
    match: {
      entryA: {
        members: Array<{ userId: string | null }>;
        teamParty: { ownerUserId: string } | null;
      };
      entryB: {
        members: Array<{ userId: string | null }>;
        teamParty: { ownerUserId: string } | null;
      };
    },
    userId: string
  ): MatchSide | null {
    const belongsTo = (entry: (typeof match)["entryA"]) =>
      entry.members.some((member) => member.userId === userId);
    if (belongsTo(match.entryA)) return "A";
    if (belongsTo(match.entryB)) return "B";
    return null;
  }

  private matchDeadlineTransition(
    match: {
      status: DotaTournamentMatchStatus;
      lobbyDeadlineAt: Date;
      confirmationDeadlineAt: Date | null;
      spectatorAdmissionEndsAt: Date | null;
      resultDeadlineAt: Date | null;
    },
    now: Date
  ): { status: DotaTournamentMatchStatus; disputeReason?: string } | null {
    if (match.status === "SCHEDULED" && match.lobbyDeadlineAt <= now) {
      return {
        status: "DISPUTED",
        disputeReason: "Лобби не было подготовлено к установленному сроку."
      };
    }
    if (
      match.status === "LOBBY_CONFIRMATION" &&
      match.confirmationDeadlineAt &&
      match.confirmationDeadlineAt <= now
    ) {
      return {
        status: "DISPUTED",
        disputeReason: "Капитаны не подтвердили готовность команд в отведённое время."
      };
    }
    if (
      ["READY", "SPECTATOR_ADMISSION"].includes(match.status) &&
      match.confirmationDeadlineAt &&
      match.confirmationDeadlineAt <= now
    ) {
      return {
        status: "DISPUTED",
        disputeReason: "Матч не был начат после подтверждения настроек лобби."
      };
    }
    if (
      match.status === "SPECTATOR_ADMISSION" &&
      match.spectatorAdmissionEndsAt &&
      match.spectatorAdmissionEndsAt <= now
    ) {
      return { status: "READY" };
    }
    if (
      ["IN_PROGRESS", "RESULT_CONFIRMATION"].includes(match.status) &&
      match.resultDeadlineAt &&
      match.resultDeadlineAt <= now
    ) {
      return {
        status: "DISPUTED",
        disputeReason: "Не удалось подтвердить результат матча в отведённое время."
      };
    }
    return null;
  }

  private async expireOverdueMatches(): Promise<void> {
    const now = new Date();
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: { status: "READY" },
      where: { status: "SPECTATOR_ADMISSION", spectatorAdmissionEndsAt: { lte: now } }
    });
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        disputeReason: "Лобби не было подготовлено к установленному сроку.",
        status: "DISPUTED"
      },
      where: { lobbyDeadlineAt: { lt: now }, status: "SCHEDULED" }
    });
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        disputeReason: "Капитаны не подтвердили готовность команд в отведённое время.",
        status: "DISPUTED"
      },
      where: {
        confirmationDeadlineAt: { lt: now },
        status: "LOBBY_CONFIRMATION"
      }
    });
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        disputeReason: "Матч не был начат после подтверждения настроек лобби.",
        status: "DISPUTED"
      },
      where: {
        confirmationDeadlineAt: { lt: now },
        status: "READY"
      }
    });
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        disputeReason: "Не удалось подтвердить результат матча в отведённое время.",
        status: "DISPUTED"
      },
      where: {
        resultDeadlineAt: { lt: now },
        status: { in: ["IN_PROGRESS", "RESULT_CONFIRMATION"] }
      }
    });
  }

  private matchConflict(message: string) {
    return createAppException({
      code: AppErrorCode.Conflict,
      message,
      statusCode: HttpStatus.CONFLICT
    });
  }

  private toMatchSummary(match: {
    bracketKind?: string;
    id: string;
    roundNumber: number;
    matchNumber: number;
    scheduledAt: Date;
    startedAt?: Date | null;
    status: DotaTournamentMatchStatus;
    gameMode: string;
    serverRegion: string;
    allowSpectators: boolean;
    cheatsEnabled: boolean;
    hostSide: string;
    streamUrl: string | null;
    lobbyDeadlineAt: Date;
    confirmationDeadlineAt: Date | null;
    captainAReadyAt: Date | null;
    captainBReadyAt: Date | null;
    spectatorAdmissionEndsAt: Date | null;
    resultDeadlineAt: Date | null;
    reportedWinnerEntryId: string | null;
    winnerEntryId: string | null;
    games?: SeriesGame[];
    bestOf?: number;
    entryA: { id: string; teamNameSnapshot: string };
    entryB: { id: string; teamNameSnapshot: string };
  }) {
    const games = match.games ?? [];
    const gameNumber = currentGameNumber(games, match.status);
    const score = seriesScore(match.entryA.id, match.entryB.id, games);
    return {
      bestOf: match.bestOf ?? 1, gameNumber,
      score,
      technicalVictory: match.status === "COMPLETED" && !!match.winnerEntryId &&
        (Math.max(score.A, score.B) < Math.floor((match.bestOf ?? 1) / 2) + 1 ||
          games.some((game) => game.winnerEntryId && !game.startedAt)),
      gameResults: [...games].sort((a, b) => a.gameNumber - b.gameNumber).map((game) => ({
        gameNumber: game.gameNumber, dotaMatchId: game.dotaMatchId, winnerEntryId: game.winnerEntryId,
        startedAt: game.startedAt?.toISOString() ?? null, completedAt: game.completedAt?.toISOString() ?? null
      })),
      bracketKind: match.bracketKind ?? "MANUAL",
      hasStarted: !!match.startedAt || games.some((game) => !!game.startedAt || !!game.winnerEntryId),
      allowSpectators: match.allowSpectators,
      cheatsEnabled: match.cheatsEnabled,
      confirmationDeadlineAt: match.confirmationDeadlineAt?.toISOString() ?? null,
      captainAReadyAt: match.captainAReadyAt?.toISOString() ?? null,
      captainBReadyAt: match.captainBReadyAt?.toISOString() ?? null,
      spectatorAdmissionEndsAt: match.spectatorAdmissionEndsAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      entryA: { id: match.entryA.id, teamName: match.entryA.teamNameSnapshot },
      entryB: { id: match.entryB.id, teamName: match.entryB.teamNameSnapshot },
      gameMode: match.gameMode,
      dotaMatchId: games.find((game) => game.gameNumber === gameNumber)?.dotaMatchId ?? null,
      hostSide: match.hostSide,
      id: match.id,
      lobbyDeadlineAt: match.lobbyDeadlineAt.toISOString(),
      matchNumber: match.matchNumber,
      reportedWinnerEntryId: match.reportedWinnerEntryId,
      resultDeadlineAt: match.resultDeadlineAt?.toISOString() ?? null,
      roundNumber: match.roundNumber,
      scheduledAt: match.scheduledAt.toISOString(),
      serverRegion: match.serverRegion,
      status: this.matchDeadlineTransition(match, new Date())?.status ?? match.status,
      streamUrl: match.streamUrl,
      winnerEntryId: match.winnerEntryId
    };
  }

  private async findTournamentEntry(tournamentSlug: string, entryId: string) {
    const entry = await this.prismaService.dotaTournamentEntry.findFirst({
      include: { tournament: true },
      where: { id: entryId, tournament: { slug: tournamentSlug } }
    });
    if (!entry) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament entry was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    return { entry, tournament: entry.tournament };
  }

  private async requireManagedEntry(
    tournamentSlug: string,
    entryId: string,
    currentUserId: string
  ) {
    const entry = await this.prismaService.dotaTournamentEntry.findFirst({
      include: {
        teamParty: { select: { ownerUserId: true } },
        tournament: true
      },
      where: { id: entryId, tournament: { slug: tournamentSlug } }
    });
    if (!entry) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament entry was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    const captainId = entry.createdByUserId ?? entry.teamParty?.ownerUserId;
    if (captainId !== currentUserId) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only this team's captain can manage its tournament entry",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    return entry;
  }

  private assertTournamentManager(currentUser: AuthenticatedUser): void {
    if (currentUser.status !== "active" ||
      (currentUser.role !== "ADMIN" && currentUser.role !== "TOURNAMENT_MODERATOR")) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Tournament management access required",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
  }

  private assertRegistrationOpen(tournament: {
    registrationClosesAt: Date | null;
    status: DotaTournamentStatus;
  }): void {
    if (
      tournament.status !== "REGISTRATION_OPEN" ||
      (tournament.registrationClosesAt && tournament.registrationClosesAt <= new Date())
    ) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Tournament registration is closed",
        statusCode: HttpStatus.CONFLICT
      });
    }
  }

  private assertEntryCanRecruit(
    tournament: {
      bracketGeneratedAt?: Date | null;
      registrationClosesAt: Date | null;
      status: DotaTournamentStatus;
    },
    entryStatus: string
  ): void {
    if (tournament.status === "REGISTRATION_OPEN") {
      this.assertRegistrationOpen(tournament);
      return;
    }
    if (
      entryStatus === "RESERVE" &&
      tournament.status === "REGISTRATION_CLOSED" &&
      !tournament.bracketGeneratedAt
    ) {
      return;
    }
    throw createAppException({
      code: AppErrorCode.Conflict,
      message: "This tournament team is no longer accepting players",
      statusCode: HttpStatus.CONFLICT
    });
  }

  private isActiveEntryStatus(status: string): boolean {
    return status === "RECRUITING" || status === "REGISTERED" || status === "RESERVE";
  }

  private hasUniqueAssignedRoles(members: Array<{ positionRole: string | null }>): boolean {
    const assigned = members
      .map((member) => member.positionRole)
      .filter((role): role is string => role !== null);
    return (
      assigned.every((role) =>
        TOURNAMENT_ROLES.includes(role as (typeof TOURNAMENT_ROLES)[number])
      ) && new Set(assigned).size === assigned.length
    );
  }

  private hasCompleteRoleLineup(members: Array<{ positionRole: string | null }>): boolean {
    if (members.length !== TOURNAMENT_ROLES.length || !this.hasUniqueAssignedRoles(members)) {
      return false;
    }
    const assigned = new Set(members.map((member) => member.positionRole));
    return TOURNAMENT_ROLES.every((role) => assigned.has(role));
  }

  private async syncEntryRegistrationStatus(
    tx: Prisma.TransactionClient,
    entryId: string
  ): Promise<void> {
    const entry = await tx.dotaTournamentEntry.findUnique({
      select: {
        id: true,
        status: true,
        tournament: {
          select: { id: true, maxTeams: true, registrationClosesAt: true, status: true }
        }
      },
      where: { id: entryId }
    });
    if (!entry || !this.isActiveEntryStatus(entry.status)) return;
    const members = await tx.dotaTournamentEntryMember.findMany({
      select: { positionRole: true },
      where: { entryId, isActive: true }
    });
    const isComplete = this.hasCompleteRoleLineup(members);
    const registrationOpen = entry.tournament.status === "REGISTRATION_OPEN" &&
      (!entry.tournament.registrationClosesAt || entry.tournament.registrationClosesAt > new Date());
    let nextStatus: "RECRUITING" | "REGISTERED" | "RESERVE";

    if (!registrationOpen) {
      nextStatus = entry.status === "REGISTERED" && isComplete ? "REGISTERED" : "RESERVE";
    } else if (!isComplete) {
      nextStatus = "RECRUITING";
    } else {
      const registeredCount = await tx.dotaTournamentEntry.count({
        where: { status: "REGISTERED", tournamentId: entry.tournament.id }
      });
      const alreadyRegistered = entry.status === "REGISTERED";
      const hasRegistrationSlot = !entry.tournament.maxTeams || alreadyRegistered ||
        registeredCount < entry.tournament.maxTeams;
      nextStatus = hasRegistrationSlot ? "REGISTERED" : "RESERVE";
    }

    await tx.dotaTournamentEntry.updateMany({
      data: { status: nextStatus },
      where: { id: entryId, status: { in: ["RECRUITING", "REGISTERED", "RESERVE"] } }
    });

    if (registrationOpen && entry.tournament.maxTeams) {
      const registeredCount = await tx.dotaTournamentEntry.count({
        where: { status: "REGISTERED", tournamentId: entry.tournament.id }
      });
      if (registeredCount >= entry.tournament.maxTeams) {
        const closed = await tx.dotaTournament.updateMany({
          data: { registrationClosesAt: new Date(), status: "REGISTRATION_CLOSED" },
          where: { id: entry.tournament.id, status: "REGISTRATION_OPEN" }
        });
        if (closed.count) {
          await tx.dotaTournamentEntry.updateMany({
            data: { status: "RESERVE" },
            where: { tournamentId: entry.tournament.id, status: "RECRUITING" }
          });
        }
      }
    }
  }

  private async assertTournamentSlotAvailable(
    tx: Prisma.TransactionClient,
    input: {
      entryId: string;
      positionRole: string;
      tournamentId: string;
      userId: string;
    }
  ): Promise<void> {
    const memberCount = await tx.dotaTournamentEntryMember.count({
      where: { entryId: input.entryId, isActive: true }
    });
    if (memberCount >= 5) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This tournament roster is full",
        statusCode: HttpStatus.CONFLICT
      });
    }
    const roleTaken = await tx.dotaTournamentEntryMember.findFirst({
      where: {
        entryId: input.entryId,
        isActive: true,
        positionRole: input.positionRole
      }
    });
    if (roleTaken) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This position is already taken",
        statusCode: HttpStatus.CONFLICT
      });
    }
    const alreadyInTournament = await tx.dotaTournamentEntryMember.findFirst({
      where: {
        isActive: true,
        tournamentId: input.tournamentId,
        userId: input.userId
      }
    });
    if (alreadyInTournament) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "You are already registered with another team in this tournament",
        statusCode: HttpStatus.CONFLICT
      });
    }
  }

  private isPrismaUniqueError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private bracketPresentation(tournament: {
    status: string;
    bracketFormat?: string;
    matchPlans?: Array<{ bracketKind: string; roundOffset: number; matchNumber: number; bestOf: number; scheduledAt: Date | null }>;
    bracketSize: number | null;
    bracketSeeds: Array<{ entryId: string; seed: number; averageMmr: number | null }>;
    entries: Array<{
      id: string;
      teamNameSnapshot: string;
      members: Array<{
        displayName: string;
        dotaProfileSlug: string | null;
        mmr: number | null;
        positionRole: string | null;
      }>;
    }>;
    matches: Array<{
      id: string;
      bestOf?: number;
      scheduledAt?: Date;
      games?: SeriesGame[];
      bracketKind: string;
      roundNumber: number;
      matchNumber: number;
      entryAId: string;
      entryBId: string;
      status: string;
      winnerEntryId: string | null;
    }>;
  }) {
    const bracket = tournament.bracketSize
      ? buildBracket(tournament.bracketSize, tournament.bracketSeeds, tournament.matches, tournament.bracketFormat)
      : null;
    const manualResults =
      !bracket && tournament.status === "COMPLETED"
        ? tournament.matches.filter((match) => match.status === "COMPLETED" && match.winnerEntryId)
        : [];
    const finalRound = Math.max(0, ...tournament.matches.map((match) => match.roundNumber));
    const finalCandidates = manualResults.filter((match) => match.roundNumber === finalRound);
    const manualFinal =
      finalCandidates.length === 1 &&
      !tournament.matches.some(
        (match) => match.roundNumber === finalRound && match.status !== "COMPLETED"
      )
        ? finalCandidates[0]
        : null;
    const places =
      bracket?.podium ??
      (manualFinal
        ? [
            manualFinal.winnerEntryId,
            manualFinal.winnerEntryId === manualFinal.entryAId
              ? manualFinal.entryBId
              : manualFinal.entryAId,
            null
          ]
        : []);
    const podium = places.map((entryId, index) => {
      const entry = tournament.entries.find((item) => item.id === entryId);
      return {
        place: index + 1,
        entryId: entry?.id ?? null,
        teamName: entry?.teamNameSnapshot ?? null,
        members:
          entry?.members.map(({ displayName, dotaProfileSlug, mmr, positionRole }) => ({
            displayName,
            dotaProfileSlug,
            mmr,
            positionRole
          })) ?? []
      };
    });
    return {
      bracket: bracket
        ? {
            size: tournament.bracketSize,
            seeds: tournament.bracketSeeds.map(({ entryId, seed, averageMmr }) => ({
              entryId,
              seed,
              averageMmr
            })),
            nodes: bracket.nodes.map((node) => {
              const match = tournament.matches.find((item) => item.id === node.matchId);
              const plan = tournament.matchPlans?.find((item) => item.bracketKind === node.kind &&
                item.roundOffset === bracketRoundOffset(tournament.bracketSize!, node.kind, node.roundNumber) &&
                item.matchNumber === node.matchNumber);
              return { ...node, bestOf: match?.bestOf ?? plan?.bestOf ?? 1,
                scheduledAt: (match?.scheduledAt ?? plan?.scheduledAt)?.toISOString() ?? null,
                score: match ? seriesScore(match.entryAId, match.entryBId, match.games ?? []) : null
              };
            })
          }
        : null,
      podium: tournament.status === "COMPLETED" ? podium : []
    };
  }

  private async completedPodiums(items: Array<{ id: string; status: string }>) {
    const ids = items.filter((item) => item.status === "COMPLETED").map((item) => item.id);
    if (!ids.length) return new Map();
    const tournaments = await this.prismaService.dotaTournament.findMany({
      where: { id: { in: ids } },
      include: {
        bracketSeeds: true,
        matches: {
          select: {
            id: true,
            bracketKind: true,
            roundNumber: true,
            matchNumber: true,
            entryAId: true,
            entryBId: true,
            status: true,
            winnerEntryId: true
          }
        },
        entries: { include: { members: { where: { isActive: true } } } }
      }
    });
    return new Map(tournaments.map((item) => [item.id, this.bracketPresentation(item).podium]));
  }

  private toTournamentSummary(tournament: {
    automaticBracket?: boolean;
    bracketFormat?: string;
    bracketGeneratedAt?: Date | null;
    _count?: { entries: number };
    allowSpectators: boolean;
    cheatsEnabled: boolean;
    description: string;
    format: string | null;
    gameMode: string;
    id: string;
    maxTeams: number | null;
    registrationClosesAt: Date | null;
    rulesUrl: string | null;
    serverRegion: string;
    slug: string;
    startsAt: Date | null;
    status: DotaTournamentStatus;
    title: string;
  }) {
    return {
      automaticBracket: tournament.automaticBracket ?? false,
      bracketFormat: tournament.bracketFormat ?? "SINGLE_ELIMINATION",
      bracketGeneratedAt: tournament.bracketGeneratedAt?.toISOString() ?? null,
      allowSpectators: tournament.allowSpectators,
      cheatsEnabled: tournament.cheatsEnabled,
      description: tournament.description,
      format: tournament.format,
      gameMode: tournament.gameMode,
      id: tournament.id,
      maxTeams: tournament.maxTeams,
      registeredTeams: tournament._count?.entries ?? 0,
      registrationClosesAt: tournament.registrationClosesAt?.toISOString() ?? null,
      rulesUrl: tournament.rulesUrl,
      serverRegion: tournament.serverRegion,
      slug: tournament.slug,
      startsAt: tournament.startsAt?.toISOString() ?? null,
      status: tournament.status,
      title: tournament.title
    };
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/ё/g, "e")
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }
}
