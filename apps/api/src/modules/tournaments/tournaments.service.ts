import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
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
import type {
  CreateDotaTournamentMatchDto,
  DisputeDotaTournamentMatchDto,
  ResolveDotaTournamentMatchDto,
  SubmitDotaTournamentLobbyDto,
  SubmitDotaTournamentResultDto
} from "./dto/create-dota-tournament-match.dto.js";

const PUBLIC_TOURNAMENT_STATUSES: DotaTournamentStatus[] = [
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
];

const LOBBY_SETUP_GRACE_MS = 15 * 60 * 1000;
const LOBBY_CONFIRMATION_MS = 5 * 60 * 1000;
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
    private readonly dotaProfileService: DotaProfileService
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

  listPublic() {
    return this.prismaService.dotaTournament.findMany({
      include: { _count: { select: { entries: { where: { status: "REGISTERED" } } } } },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      where: { status: { in: PUBLIC_TOURNAMENT_STATUSES } }
    }).then((items) => items.map((item) => this.toTournamentSummary(item)));
  }

  async getPublic(slug: string) {
    const tournament = await this.prismaService.dotaTournament.findFirst({
      include: {
        _count: { select: { entries: { where: { status: "REGISTERED" } } } },
        matches: {
          include: {
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
          where: { status: { in: ["RECRUITING", "REGISTERED"] } }
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
          { createdByUserId: currentUser.id, teamPartyId: null },
          { teamParty: { ownerUserId: currentUser.id } }
        ],
        status: { in: ["RECRUITING", "REGISTERED"] },
        tournamentId: tournament.id
      }
    });

    return entries
      .filter(
        (entry) =>
          (entry.teamParty?.ownerUserId ?? entry.createdByUserId) === currentUser.id
      )
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
    this.assertRegistrationOpen(tournament);

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
      this.assertRegistrationOpen(latestTournament);

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

      const fullTeamCount = await tx.dotaTournamentEntry.count({
        where: { status: "REGISTERED", tournamentId: tournament.id }
      });
      if (latestTournament.maxTeams && fullTeamCount >= latestTournament.maxTeams) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Tournament team limit has been reached",
          statusCode: HttpStatus.CONFLICT
        });
      }

      const entry = await tx.dotaTournamentEntry.create({
        data: {
          createdByUserId: currentUser.id,
          joinMode: input.joinMode ?? "CONFIRM",
          status: "RECRUITING",
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
        members: { where: { isActive: true }, orderBy: [{ positionRole: "asc" }, { createdAt: "asc" }] },
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
    if (!this.isActiveEntryStatus(entry.status)) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This team is not registered",
        statusCode: HttpStatus.CONFLICT
      });
    }
    await this.prismaService.dotaTournamentEntry.update({
      data: { joinMode },
      where: { id: entry.id }
    });
    return { joinMode, ok: true };
  }

  async joinEntry(
    tournamentSlug: string,
    entryId: string,
    input: JoinDotaTournamentEntryDto,
    currentUser: AuthenticatedUser
  ) {
    const { entry, tournament } = await this.findTournamentEntry(tournamentSlug, entryId);
    this.assertRegistrationOpen(tournament);
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
        this.assertRegistrationOpen(latest.tournament);

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
          entryStatus: latest.status,
          maxTeams: latest.tournament.maxTeams,
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
            isActive: true
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
      return { ok: true, tournament: await this.getPublic(tournamentSlug) };
    }

    this.assertRegistrationOpen(entry.tournament);
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
          include: { tournament: true },
          where: { id: entryId, tournament: { slug: tournamentSlug } }
        });
        if (!latestEntry || !this.isActiveEntryStatus(latestEntry.status)) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This team is no longer registered for the tournament",
            statusCode: HttpStatus.CONFLICT
          });
        }
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
        this.assertRegistrationOpen(currentTournament);
        await this.assertTournamentSlotAvailable(tx, {
          entryId,
          entryStatus: latestEntry.status,
          maxTeams: currentTournament.maxTeams,
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
      this.assertRegistrationOpen(entry.tournament);
      const member = await tx.dotaTournamentEntryMember.findUnique({
        where: { entryId_userId: { entryId, userId: currentUser.id } }
      });
      if (!member?.isActive || member.positionRole) {
        throw this.matchConflict("Only an active member without an assigned position can claim a role");
      }
      const occupied = await tx.dotaTournamentEntryMember.findFirst({
        where: { entryId, isActive: true, positionRole }
      });
      if (occupied) throw this.matchConflict("This position is already taken");
      if (entry.status === "RECRUITING" && entry.tournament.maxTeams) {
        const count = await tx.dotaTournamentEntry.count({
          where: { tournamentId: tournament.id, status: "REGISTERED" }
        });
        if (count >= entry.tournament.maxTeams) {
          throw this.matchConflict("Tournament team limit has been reached");
        }
      }
      await tx.dotaTournamentEntryMember.update({ data: { positionRole }, where: { id: member.id } });
      await this.syncEntryRegistrationStatus(tx, entryId);
    });
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
    if (!entry.teamPartyId && entry.createdByUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "The squad captain must withdraw the tournament entry instead of leaving it",
        statusCode: HttpStatus.CONFLICT
      });
    }
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournament.id}`}))`;
      const latestTournament = await tx.dotaTournament.findUnique({ where: { id: tournament.id } });
      const latestEntry = await tx.dotaTournamentEntry.findFirst({
        where: { id: entryId, tournamentId: tournament.id }
      });
      if (
        !latestTournament ||
        !latestEntry ||
        !this.isActiveEntryStatus(latestEntry.status) ||
        ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(latestTournament.status)
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
      await this.syncEntryRegistrationStatus(tx, entryId);
      await tx.dotaTournamentEntryRequest.updateMany({
        data: { status: "WITHDRAWN" },
        where: { entryId, status: "ACCEPTED", userId: currentUser.id }
      });
    });
    return { ok: true, tournament: await this.getPublic(tournamentSlug) };
  }

  async listAdminMatches(tournamentSlug: string) {
    await this.expireOverdueMatches();
    const tournament = await this.prismaService.dotaTournament.findUnique({ where: { slug: tournamentSlug } });
    if (!tournament) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    const matches = await this.prismaService.dotaTournamentMatch.findMany({
      include: {
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
    const tournament = await this.prismaService.dotaTournament.findUnique({ where: { slug: tournamentSlug } });
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
      if (!latestTournament || !["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(latestTournament.status)) {
        throw this.matchConflict("Tournament matches can only be scheduled after registration closes");
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
      if (duplicateNumber) throw this.matchConflict("A match already uses this round and match number");
      const activeMatch = await tx.dotaTournamentMatch.findFirst({
        select: { id: true },
        where: {
          OR: [
            { entryAId: { in: entryIds } },
            { entryBId: { in: entryIds } }
          ],
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          tournamentId: tournament.id
        }
      });
      if (activeMatch) throw this.matchConflict("A team already has an unresolved match in this tournament");

      return tx.dotaTournamentMatch.create({
        data: {
          allowSpectators: latestTournament.allowSpectators,
          cheatsEnabled: latestTournament.cheatsEnabled,
          createdByUserId: currentUser.id,
          entryAId: input.entryAId,
          entryBId: input.entryBId,
          gameMode: latestTournament.gameMode,
          hostSide: input.hostSide,
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

  async getParticipantMatch(
    tournamentSlug: string,
    matchId: string,
    currentUser: AuthenticatedUser
  ) {
    await this.expireOverdueMatches();
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const viewerSide = this.matchSideForUser(match, currentUser.id);
    if (!viewerSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only players on either tournament roster can open this match",
        statusCode: HttpStatus.FORBIDDEN
      });
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
      canManageLobby: viewerSide === match.hostSide
    };
  }

  async submitLobby(
    tournamentSlug: string,
    matchId: string,
    input: SubmitDotaTournamentLobbyDto,
    currentUser: AuthenticatedUser
  ) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchSideForUser(match, currentUser.id);
    if (!actorSide || actorSide !== match.hostSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only a player from the assigned host team can submit lobby details",
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
      throw this.matchConflict("The lobby setup deadline passed; an administrator must review this match");
    }
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        confirmationDeadlineAt: new Date(now.getTime() + LOBBY_CONFIRMATION_MS),
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

  async confirmLobby(tournamentSlug: string, matchId: string, currentUser: AuthenticatedUser) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchSideForUser(match, currentUser.id);
    if (!actorSide || actorSide === match.hostSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "A player from the other team must confirm the lobby",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    const now = new Date();
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        confirmationDeadlineAt: new Date(now.getTime() + LOBBY_SETUP_GRACE_MS),
        settingsConfirmedAt: now,
        settingsConfirmedByUserId: currentUser.id,
        status: "READY"
      },
      where: {
        confirmationDeadlineAt: { gt: now },
        id: match.id,
        status: "LOBBY_CONFIRMATION"
      }
    });
    if (updated.count !== 1) {
      await this.expireOverdueMatches();
      throw this.matchConflict("Lobby confirmation is no longer available");
    }
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async startMatch(tournamentSlug: string, matchId: string, currentUser: AuthenticatedUser) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchSideForUser(match, currentUser.id);
    if (!actorSide || actorSide !== match.hostSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the host team can mark the match as started",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    const now = new Date();
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        resultDeadlineAt: new Date(now.getTime() + MATCH_DURATION_LIMIT_MS),
        startedAt: now,
        status: "IN_PROGRESS"
      },
      where: {
        confirmationDeadlineAt: { gt: now },
        id: match.id,
        status: "READY"
      }
    });
    if (updated.count !== 1) throw this.matchConflict("The match is not ready to start");
    await this.prismaService.dotaTournament.updateMany({
      data: { status: "IN_PROGRESS" },
      where: { id: match.tournamentId, status: "REGISTRATION_CLOSED" }
    });
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
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
    if (match.status !== "IN_PROGRESS") throw this.matchConflict("This match is not accepting a result");
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
      throw this.matchConflict("The result deadline passed or another result was already submitted");
    }
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async confirmResult(tournamentSlug: string, matchId: string, currentUser: AuthenticatedUser) {
    const match = await this.findMatchForWorkflow(tournamentSlug, matchId);
    const actorSide = this.matchSideForUser(match, currentUser.id);
    const reporterSide = match.resultReportedByUserId
      ? this.matchSideForUser(match, match.resultReportedByUserId)
      : null;
    if (!actorSide || !reporterSide || actorSide === reporterSide) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "A player from the other team must confirm the result",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    if (match.status !== "RESULT_CONFIRMATION" || !match.reportedWinnerEntryId) {
      throw this.matchConflict("There is no result waiting for confirmation");
    }
    const now = new Date();
    const updated = await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        resultConfirmedAt: now,
        resultConfirmedByUserId: currentUser.id,
        status: "COMPLETED",
        winnerEntryId: match.reportedWinnerEntryId
      },
      where: {
        resultDeadlineAt: { gt: now },
        id: match.id,
        status: "RESULT_CONFIRMATION"
      }
    });
    if (updated.count !== 1) {
      await this.expireOverdueMatches();
      throw this.matchConflict("The result confirmation deadline passed");
    }
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
    const mayDisputeLobby = match.status === "LOBBY_CONFIRMATION" && actorSide !== match.hostSide;
    const mayDisputeResult =
      match.status === "RESULT_CONFIRMATION" && actorSide !== reporterSide;
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
    if (updated.count !== 1) throw this.matchConflict("The match changed while you were reporting the issue");
    return this.getParticipantMatch(tournamentSlug, matchId, currentUser);
  }

  async resolveAdminMatch(
    matchId: string,
    input: ResolveDotaTournamentMatchDto,
    currentUser: AuthenticatedUser
  ) {
    const match = await this.prismaService.dotaTournamentMatch.findUnique({
      include: {
        entryA: { select: { id: true, teamNameSnapshot: true } },
        entryB: { select: { id: true, teamNameSnapshot: true } }
      },
      where: { id: matchId }
    });
    if (!match) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Tournament match was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    if (match.status !== "DISPUTED") throw this.matchConflict("Only disputed matches can be resolved here");
    if (!input.note.trim()) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Add a note describing the admin decision",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
    const now = new Date();
    let nextStatus: DotaTournamentMatchStatus;
    if (input.resolution === "REPLAY") {
      const updated = await this.prismaService.dotaTournamentMatch.updateMany({
        data: {
          confirmationDeadlineAt: null,
          disputeReason: null,
          lobbyDeadlineAt: new Date(now.getTime() + LOBBY_SETUP_GRACE_MS),
          lobbyName: null,
          lobbyPassword: null,
          lobbyProofUrl: null,
          lobbySubmittedAt: null,
          lobbySubmittedByUserId: null,
          reportedWinnerEntryId: null,
          resolutionNote: input.note.trim(),
          resolvedAt: now,
          resolvedByUserId: currentUser.id,
          resultConfirmedAt: null,
          resultConfirmedByUserId: null,
          resultDeadlineAt: null,
          resultEvidenceUrl: null,
          resultReportedAt: null,
          resultReportedByUserId: null,
          scheduledAt: now,
          settingsConfirmedAt: null,
          settingsConfirmedByUserId: null,
          startedAt: null,
          status: "SCHEDULED",
          winnerEntryId: null
        },
        where: { id: match.id, status: "DISPUTED" }
      });
      if (updated.count !== 1) throw this.matchConflict("Another administrator already resolved this match");
      nextStatus = "SCHEDULED";
    } else {
      const winnerEntryId =
        input.resolution === "ENTRY_A"
          ? match.entryAId
          : input.resolution === "ENTRY_B"
            ? match.entryBId
            : null;
      const updated = await this.prismaService.dotaTournamentMatch.updateMany({
        data: {
          disputeReason: null,
          resolutionNote: input.note.trim(),
          resolvedAt: now,
          resolvedByUserId: currentUser.id,
          status: winnerEntryId ? "COMPLETED" : "CANCELLED",
          winnerEntryId
        },
        where: { id: match.id, status: "DISPUTED" }
      });
      if (updated.count !== 1) throw this.matchConflict("Another administrator already resolved this match");
      nextStatus = winnerEntryId ? "COMPLETED" : "CANCELLED";
    }
    const resolved = await this.prismaService.dotaTournamentMatch.findUniqueOrThrow({
      include: {
        entryA: { select: { id: true, teamNameSnapshot: true } },
        entryB: { select: { id: true, teamNameSnapshot: true } }
      },
      where: { id: match.id }
    });
    return this.toMatchSummary({ ...resolved, status: nextStatus });
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
          (currentTournament.registrationClosesAt && currentTournament.registrationClosesAt <= new Date())
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

        const registeredTeams = await tx.dotaTournamentEntry.count({
          where: { status: "REGISTERED", tournamentId: tournament.id }
        });
        const completeLineup = this.hasCompleteRoleLineup(team.members);
        if (
          currentTournament.maxTeams &&
          registeredTeams >= currentTournament.maxTeams
        ) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "Tournament team limit has been reached",
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
                status: completeLineup ? "REGISTERED" : "RECRUITING",
                teamNameSnapshot: team.name,
                teamSlugSnapshot: team.slug
              },
              where: { id: existing.id }
            })
          : await tx.dotaTournamentEntry.create({
              data: {
                createdByUserId: currentUser.id,
                joinMode: input.joinMode ?? "CONFIRM",
                status: completeLineup ? "REGISTERED" : "RECRUITING",
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
              mmr: Number.isFinite(parsedMmr) ? parsedMmr : null,
              positionRole: member.positionRole
            },
            where: {
              entryId_userId: { entryId: entry.id, userId: member.userId }
            }
          });
        }
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
    const isCaptain = entry.teamParty
      ? entry.teamParty.ownerUserId === currentUser.id
      : entry.createdByUserId === currentUser.id;
    if (!isCaptain) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the team captain can withdraw its entry",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    if (["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(entry.tournament.status)) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This tournament entry can no longer be withdrawn",
        statusCode: HttpStatus.CONFLICT
      });
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${entry.tournamentId}`}))`;
      const latest = await tx.dotaTournamentEntry.findFirst({
        include: { tournament: true },
        where: { id: entry.id, tournament: { slug: tournamentSlug } }
      });
      if (!latest || !this.isActiveEntryStatus(latest.status)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This team is no longer registered for the tournament",
          statusCode: HttpStatus.CONFLICT
        });
      }
      if (["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(latest.tournament.status)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This tournament entry can no longer be withdrawn",
          statusCode: HttpStatus.CONFLICT
        });
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
    });

    return this.getPublic(tournamentSlug);
  }

  listForAdmin() {
    return this.prismaService.dotaTournament.findMany({
      include: { _count: { select: { entries: { where: { status: "REGISTERED" } } } } },
      orderBy: [{ createdAt: "desc" }]
    }).then((items) => items.map((item) => this.toTournamentSummary(item)));
  }

  async create(input: CreateDotaTournamentDto, currentUser: AuthenticatedUser) {
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
          allowSpectators: input.allowSpectators ?? false,
          cheatsEnabled: input.cheatsEnabled ?? false,
          description: input.description?.trim() ?? "",
          format: input.format?.trim() || null,
          gameMode: input.gameMode ?? "ALL_PICK",
          maxTeams: input.maxTeams ?? null,
          registrationClosesAt: input.registrationClosesAt ? new Date(input.registrationClosesAt) : null,
          rulesUrl: input.rulesUrl ?? null,
          serverRegion: input.serverRegion ?? "EUROPE",
          slug,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          status: input.status ?? "DRAFT",
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
    const nextSlug = input.slug === undefined ? current.slug : this.slugify(input.slug) || current.slug;
    if (nextSlug !== current.slug) {
      const collision = await this.prismaService.dotaTournament.findUnique({ where: { slug: nextSlug } });
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
      return tx.dotaTournament.update({
        data: {
          description: input.description?.trim() ?? latest.description,
          allowSpectators: input.allowSpectators ?? latest.allowSpectators,
          cheatsEnabled: input.cheatsEnabled ?? latest.cheatsEnabled,
          format: input.format === undefined ? latest.format : input.format.trim() || null,
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
            input.startsAt === undefined ? latest.startsAt : input.startsAt ? new Date(input.startsAt) : null,
          status: input.status ?? latest.status,
          title: input.title?.trim() || latest.title
        },
        where: { id: current.id }
      });
    });
    return this.toTournamentSummary(updated);
  }

  private async findMatchForWorkflow(tournamentSlug: string, matchId: string) {
    const match = await this.prismaService.dotaTournamentMatch.findFirst({
      include: {
        entryA: {
          include: {
            members: { select: { userId: true }, where: { isActive: true } },
            teamParty: { select: { ownerUserId: true } }
          }
        },
        entryB: {
          include: {
            members: { select: { userId: true }, where: { isActive: true } },
            teamParty: { select: { ownerUserId: true } }
          }
        },
        tournament: { select: { slug: true, title: true } }
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

  private matchSideForUser(
    match: {
      entryA: { members: Array<{ userId: string | null }>; teamParty: { ownerUserId: string } | null };
      entryB: { members: Array<{ userId: string | null }>; teamParty: { ownerUserId: string } | null };
    },
    userId: string
  ): MatchSide | null {
    const belongsTo = (entry: (typeof match)["entryA"]) =>
      entry.teamParty?.ownerUserId === userId || entry.members.some((member) => member.userId === userId);
    if (belongsTo(match.entryA)) return "A";
    if (belongsTo(match.entryB)) return "B";
    return null;
  }

  private async expireOverdueMatches(): Promise<void> {
    const now = new Date();
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        disputeReason: "Лобби не было подготовлено к установленному сроку.",
        status: "DISPUTED"
      },
      where: { lobbyDeadlineAt: { lt: now }, status: "SCHEDULED" }
    });
    await this.prismaService.dotaTournamentMatch.updateMany({
      data: {
        disputeReason: "Соперник не подтвердил настройки лобби в отведённое время.",
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
      where: { resultDeadlineAt: { lt: now }, status: { in: ["IN_PROGRESS", "RESULT_CONFIRMATION"] } }
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
    id: string;
    roundNumber: number;
    matchNumber: number;
    scheduledAt: Date;
    status: DotaTournamentMatchStatus;
    gameMode: string;
    serverRegion: string;
    allowSpectators: boolean;
    cheatsEnabled: boolean;
    hostSide: string;
    streamUrl: string | null;
    lobbyDeadlineAt: Date;
    confirmationDeadlineAt: Date | null;
    resultDeadlineAt: Date | null;
    reportedWinnerEntryId: string | null;
    winnerEntryId: string | null;
    entryA: { id: string; teamNameSnapshot: string };
    entryB: { id: string; teamNameSnapshot: string };
  }) {
    return {
      allowSpectators: match.allowSpectators,
      cheatsEnabled: match.cheatsEnabled,
      confirmationDeadlineAt: match.confirmationDeadlineAt?.toISOString() ?? null,
      entryA: { id: match.entryA.id, teamName: match.entryA.teamNameSnapshot },
      entryB: { id: match.entryB.id, teamName: match.entryB.teamNameSnapshot },
      gameMode: match.gameMode,
      hostSide: match.hostSide,
      id: match.id,
      lobbyDeadlineAt: match.lobbyDeadlineAt.toISOString(),
      matchNumber: match.matchNumber,
      reportedWinnerEntryId: match.reportedWinnerEntryId,
      resultDeadlineAt: match.resultDeadlineAt?.toISOString() ?? null,
      roundNumber: match.roundNumber,
      scheduledAt: match.scheduledAt.toISOString(),
      serverRegion: match.serverRegion,
      status: match.status,
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
    const captainId = entry.teamParty?.ownerUserId ?? entry.createdByUserId;
    if (captainId !== currentUserId) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only this team's captain can manage its tournament entry",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
    return entry;
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

  private isActiveEntryStatus(status: string): boolean {
    return status === "RECRUITING" || status === "REGISTERED";
  }

  private hasUniqueAssignedRoles(members: Array<{ positionRole: string | null }>): boolean {
    const assigned = members
      .map((member) => member.positionRole)
      .filter((role): role is string => role !== null);
    return (
      assigned.every((role) => TOURNAMENT_ROLES.includes(role as (typeof TOURNAMENT_ROLES)[number])) &&
      new Set(assigned).size === assigned.length
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
    const members = await tx.dotaTournamentEntryMember.findMany({
      select: { positionRole: true },
      where: { entryId, isActive: true }
    });
    const positions = new Set(members.map((member) => member.positionRole).filter(Boolean));
    const isComplete =
      members.length === TOURNAMENT_ROLES.length &&
      TOURNAMENT_ROLES.every((role) => positions.has(role));
    await tx.dotaTournamentEntry.update({
      data: { status: isComplete ? "REGISTERED" : "RECRUITING" },
      where: { id: entryId }
    });
  }

  private async assertTournamentSlotAvailable(
    tx: Prisma.TransactionClient,
    input: {
      entryId: string;
      entryStatus: string;
      maxTeams: number | null;
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
    if (input.entryStatus === "RECRUITING" && input.maxTeams) {
      const registeredTeams = await tx.dotaTournamentEntry.count({
        where: { status: "REGISTERED", tournamentId: input.tournamentId }
      });
      if (registeredTeams >= input.maxTeams) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Tournament team limit has been reached",
          statusCode: HttpStatus.CONFLICT
        });
      }
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
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }

  private toTournamentSummary(tournament: {
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
