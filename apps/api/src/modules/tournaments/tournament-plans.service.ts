import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import { AppErrorCode } from "../../common/exceptions/app-error-code.js";
import { createAppException } from "../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { UpdateTournamentMatchPlanDto, UpdateTournamentSeriesSettingsDto } from "./dto/tournament-match-plan.dto.js";
import { bracketPlanningNodes, bracketRoundOffset, buildBracket } from "./tournament-bracket.js";

const include = {
  matchPlans: true, matches: { include: { games: true } }, bracketSeeds: true,
  entries: { where: { status: { in: ["RECRUITING", "REGISTERED", "RESERVE"] } },
    include: { members: { where: { isActive: true } } } }
} satisfies Prisma.DotaTournamentInclude;
type Tournament = Prisma.DotaTournamentGetPayload<{ include: typeof include }>;
type Match = Tournament["matches"][number];

@Injectable()
export class DotaTournamentPlansService {
  constructor(private readonly prisma: PrismaService) {}
  private fail(message: string, statusCode = HttpStatus.CONFLICT): never {
    throw createAppException({ code: statusCode === 403 ? AppErrorCode.Forbidden : AppErrorCode.Conflict, message, statusCode });
  }
  private manager(user: AuthenticatedUser) {
    if (!["ADMIN", "TOURNAMENT_MODERATOR"].includes(user.role) || user.status !== "active")
      this.fail("Only tournament staff can change match plans", HttpStatus.FORBIDDEN);
  }
  private canReschedule(match: Match) {
    return !match.startedAt && !match.games.some((game) => game.startedAt && !game.winnerEntryId) &&
      ["SCHEDULED", "LOBBY_CONFIRMATION", "READY", "SPECTATOR_ADMISSION", "DISPUTED"].includes(match.status);
  }
  private size(tournament: Tournament) {
    return tournament.bracketSize ?? 2 ** Math.ceil(Math.log2(tournament.maxTeams ??
      Math.max(2, tournament.entries.filter((entry) => entry.status === "REGISTERED").length)));
  }
  private async load(slug: string, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const tournament = await db.dotaTournament.findUnique({ where: { slug }, include });
    if (!tournament) this.fail("Tournament was not found", HttpStatus.NOT_FOUND);
    return tournament;
  }
  private view(tournament: Tournament) {
    const size = this.size(tournament);
    const preview = !tournament.bracketGeneratedAt;
    const actual = preview ? null : buildBracket(size, tournament.bracketSeeds, tournament.matches, tournament.bracketFormat);
    const nodes = actual?.nodes ?? bracketPlanningNodes(size, tournament.bracketFormat);
    const terminal = ["COMPLETED", "CANCELLED"].includes(tournament.status);
    return {
      id: tournament.id, slug: tournament.slug, title: tournament.title, status: tournament.status,
      automaticBracket: tournament.automaticBracket, bracketFormat: tournament.bracketFormat,
      bracketGeneratedAt: tournament.bracketGeneratedAt?.toISOString() ?? null,
      description: tournament.description, format: tournament.format, maxTeams: tournament.maxTeams,
      registeredTeams: tournament.entries.filter((entry) => entry.status === "REGISTERED").length,
      startsAt: tournament.startsAt?.toISOString() ?? null,
      registrationClosesAt: tournament.registrationClosesAt?.toISOString() ?? null,
      rulesUrl: tournament.rulesUrl, gameMode: tournament.gameMode, serverRegion: tournament.serverRegion,
      allowSpectators: tournament.allowSpectators, cheatsEnabled: tournament.cheatsEnabled,
      planning: preview,
      entries: tournament.entries.map((entry) => ({
        id: entry.id, teamName: entry.teamNameSnapshot, status: entry.status,
        joinMode: entry.joinMode, teamPartySlug: null,
        members: entry.members.map(({ displayName, dotaProfileSlug, mmr, positionRole }) => ({
          displayName, dotaProfileSlug, mmr, positionRole
        }))
      })),
      matches: [],
      bracket: tournament.automaticBracket ? {
        size, seeds: preview ? [] : tournament.bracketSeeds,
        nodes: nodes.map((node) => {
          const roundOffset = bracketRoundOffset(size, node.kind, node.roundNumber);
          const plan = tournament.matchPlans.find((item) => item.bracketKind === node.kind &&
            item.roundOffset === roundOffset && item.matchNumber === node.matchNumber);
          const match = tournament.matches.find((item) => item.id === node.matchId);
          const done = terminal || !!match && ["COMPLETED", "CANCELLED"].includes(match.status);
          const started = !!match && (!!match.startedAt || match.games.some((game) => !!game.startedAt || !!game.winnerEntryId));
          const canReschedule = !match || this.canReschedule(match);
          return { ...node, roundOffset, bestOf: match?.bestOf ?? plan?.bestOf ?? 1,
            scheduledAt: (match?.scheduledAt ?? plan?.scheduledAt)?.toISOString() ?? null,
            canEditBestOf: !done && !started,
            canEditTime: !done && canReschedule
          };
        })
      } : null
    };
  }
  async get(slug: string, user: AuthenticatedUser) {
    this.manager(user);
    return this.view(await this.load(slug));
  }
  private async apply(tx: Prisma.TransactionClient, match: Match, input: UpdateTournamentSeriesSettingsDto) {
    if (["COMPLETED", "CANCELLED"].includes(match.status)) this.fail("A finished match cannot be edited");
    if (input.bestOf !== undefined && ![1, 3, 5].includes(input.bestOf)) this.fail("Choose BO1, BO3 or BO5");
    if (input.bestOf !== undefined && input.bestOf !== match.bestOf &&
      (!!match.startedAt || match.games.some((game) => !!game.startedAt || !!game.winnerEntryId)))
      this.fail("The series format is fixed after the first game starts");
    const date = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (!Number.isFinite(date.getTime())) this.fail("Invalid start time");
    const scheduledAt = new Date(Math.max(date.getTime(), Date.now()));
    if (input.scheduledAt !== undefined && !this.canReschedule(match))
      this.fail("Only a match before the current game starts can be rescheduled");
    const confirmationDeadlineAt = match.status === "LOBBY_CONFIRMATION"
      ? new Date(Math.max(scheduledAt.getTime(), Date.now()) + 5 * 60_000)
      : match.status === "READY" || match.status === "SPECTATOR_ADMISSION"
        ? new Date(Math.max(scheduledAt.getTime(), match.spectatorAdmissionEndsAt?.getTime() ?? Date.now()) + 15 * 60_000)
        : undefined;
    return tx.dotaTournamentMatch.update({ where: { id: match.id }, data: {
      ...(input.bestOf === undefined ? {} : { bestOf: input.bestOf }),
      ...(input.scheduledAt === undefined ? {} : {
        scheduledAt, lobbyDeadlineAt: new Date(scheduledAt.getTime() + 15 * 60_000),
        ...(confirmationDeadlineAt ? { confirmationDeadlineAt } : {})
      })
    } });
  }
  async save(slug: string, input: UpdateTournamentMatchPlanDto, user: AuthenticatedUser) {
    this.manager(user);
    const initial = await this.load(slug);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.id}))`;
      const tournament = await this.load(slug, tx);
      if (!tournament.automaticBracket || ["COMPLETED", "CANCELLED"].includes(tournament.status))
        this.fail("This tournament does not accept bracket settings");
      const size = this.size(tournament);
      const node = bracketPlanningNodes(size, tournament.bracketFormat).find((candidate) =>
        candidate.kind === input.bracketKind && candidate.matchNumber === input.matchNumber &&
        bracketRoundOffset(size, candidate.kind, candidate.roundNumber) === input.roundOffset);
      if (!node) this.fail("This position is not part of the tournament bracket");
      const existing = tournament.matchPlans.find((plan) => plan.bracketKind === input.bracketKind &&
        plan.roundOffset === input.roundOffset && plan.matchNumber === input.matchNumber);
      const match = tournament.matches.find((item) => item.bracketKind === node.kind &&
        item.roundNumber === node.roundNumber && item.matchNumber === node.matchNumber);
      if (match) await this.apply(tx, match, input);
      if (input.bestOf !== undefined && ![1, 3, 5].includes(input.bestOf)) this.fail("Choose BO1, BO3 or BO5");
      const scheduledAt = input.scheduledAt === undefined ? existing?.scheduledAt ?? null
        : input.scheduledAt ? new Date(input.scheduledAt) : null;
      if (scheduledAt && !Number.isFinite(scheduledAt.getTime())) this.fail("Invalid start time");
      const position = { tournamentId: tournament.id, bracketKind: input.bracketKind,
        roundOffset: input.roundOffset, matchNumber: input.matchNumber };
      await tx.dotaTournamentMatchPlan.upsert({
        where: { tournamentId_bracketKind_roundOffset_matchNumber: position },
        create: { ...position, bestOf: input.bestOf ?? match?.bestOf ?? 1, scheduledAt, updatedByUserId: user.id },
        update: { bestOf: input.bestOf ?? match?.bestOf ?? existing?.bestOf ?? 1, scheduledAt, updatedByUserId: user.id }
      });
    });
    return this.get(slug, user);
  }
  async saveMatch(matchId: string, input: UpdateTournamentSeriesSettingsDto, user: AuthenticatedUser) {
    this.manager(user);
    const initial = await this.prisma.dotaTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: true } });
    if (!initial) this.fail("Match was not found", HttpStatus.NOT_FOUND);
    if (initial.bracketKind !== "MANUAL") {
      return this.save(initial.tournament.slug, {
        ...input, bracketKind: initial.bracketKind as UpdateTournamentMatchPlanDto["bracketKind"],
        roundOffset: bracketRoundOffset(initial.tournament.bracketSize!, initial.bracketKind, initial.roundNumber),
        matchNumber: initial.matchNumber
      }, user);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dota-tournament:" + initial.tournamentId}))`;
      const tournament = await this.load(initial.tournament.slug, tx);
      if (["COMPLETED", "CANCELLED"].includes(tournament.status)) this.fail("The tournament has finished");
      await this.apply(tx, tournament.matches.find((match) => match.id === matchId)!, input);
    });
    return { ok: true };
  }
}
