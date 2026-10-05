import {
  ConflictException,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy
} from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import { buildBracket, rankEntries } from "./tournament-bracket.js";

const entryInclude = { members: { where: { isActive: true } } } as const;

@Injectable()
export class DotaTournamentBracketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DotaTournamentBracketService.name);
  private timer?: NodeJS.Timeout;
  private scanning = false;
  private dueCursor: string | undefined;
  private activeCursor: string | undefined;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.scan(), 30_000).unref();
    void this.scan();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async startLocked(tx: Prisma.TransactionClient, tournamentId: string, strict = true) {
    const tournament = await tx.dotaTournament.findUniqueOrThrow({ where: { id: tournamentId } });
    if (!tournament.automaticBracket || tournament.bracketGeneratedAt) return;
    if (!strict && !["REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(tournament.status))
      return;
    if (
      !(["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS"] as string[]).includes(
        tournament.status
      )
    ) {
      throw new ConflictException("Сетку можно создать только после открытия регистрации");
    }
    const entries = await tx.dotaTournamentEntry.findMany({
      where: { tournamentId, status: "REGISTERED" },
      include: entryInclude
    });
    const valid = entries.filter(
      (entry) =>
        entry.members.length === 5 &&
        new Set(entry.members.map((member) => member.positionRole)).size === 5 &&
        entry.members.every((member) =>
          ["1", "2", "3", "4", "5"].includes(member.positionRole ?? "")
        )
    );
    if (valid.length < 2 || valid.length > 256 || valid.length !== entries.length) {
      if (strict)
        throw new ConflictException(
          "Для старта нужны от 2 до 256 полных команд с пятью разными ролями"
        );
      await tx.dotaTournament.updateMany({
        where: { id: tournamentId, status: "REGISTRATION_OPEN" },
        data: { status: "REGISTRATION_CLOSED" }
      });
      return;
    }
    if (await tx.dotaTournamentMatch.count({ where: { tournamentId } })) {
      throw new ConflictException(
        "В турнире уже назначены матчи вручную: автоматическую сетку включить нельзя"
      );
    }
    const seeds = rankEntries(valid);
    const now = new Date();
    await tx.dotaTournamentBracketSeed.createMany({
      data: seeds.map((seed) => ({ ...seed, tournamentId }))
    });
    await tx.dotaTournament.update({
      where: { id: tournamentId },
      data: {
        bracketGeneratedAt: now,
        startsAt: now,
        bracketSize: 2 ** Math.ceil(Math.log2(valid.length)),
        status: "IN_PROGRESS",
        registrationClosesAt:
          tournament.registrationClosesAt && tournament.registrationClosesAt < now
            ? tournament.registrationClosesAt
            : now
      }
    });
    await this.reconcileLocked(tx, tournamentId);
  }

  async reconcile(tournamentId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${tournamentId}`}))`;
      await this.reconcileLocked(tx, tournamentId);
    });
  }

  async reconcileLocked(tx: Prisma.TransactionClient, tournamentId: string) {
    const tournament = await tx.dotaTournament.findUniqueOrThrow({
      where: { id: tournamentId },
      include: { bracketSeeds: true, matches: true }
    });
    if (
      !tournament.bracketSize ||
      !tournament.bracketGeneratedAt ||
      tournament.status !== "IN_PROGRESS"
    )
      return;
    const bracket = buildBracket(
      tournament.bracketSize,
      tournament.bracketSeeds,
      tournament.matches
    );
    const now = new Date();
    if (bracket.ready.length)
      await tx.dotaTournamentMatch.createMany({
        data: bracket.ready.map((node) => ({
          tournamentId,
          createdByUserId: tournament.createdByUserId,
          bracketKind: node.kind,
          roundNumber: node.roundNumber,
          matchNumber: node.matchNumber,
          entryAId: node.entryAId!,
          entryBId: node.entryBId!,
          hostSide: "A",
          status: "SCHEDULED",
          scheduledAt: now,
          lobbyDeadlineAt: new Date(now.getTime() + 15 * 60_000),
          gameMode: tournament.gameMode,
          serverRegion: tournament.serverRegion,
          allowSpectators: tournament.allowSpectators,
          cheatsEnabled: tournament.cheatsEnabled
        }))
      });
    if (bracket.complete)
      await tx.dotaTournament.update({
        where: { id: tournamentId },
        data: { status: "COMPLETED" }
      });
  }

  private async scan() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const due = await this.prisma.dotaTournament.findMany({
        select: { id: true },
        take: 25,
        orderBy: { id: "asc" },
        where: {
          automaticBracket: true,
          ...(this.dueCursor ? { id: { gt: this.dueCursor } } : {}),
          bracketGeneratedAt: null,
          startsAt: { lte: new Date() },
          status: { in: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED"] }
        }
      });
      this.dueCursor = due.length === 25 ? due.at(-1)?.id : undefined;
      for (const item of due) {
        await this.prisma
          .$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dota-tournament:${item.id}`}))`;
            await this.startLocked(tx, item.id, false);
          })
          .catch((error: unknown) =>
            this.logger.error("Could not start tournament bracket", error)
          );
      }
      const active = await this.prisma.dotaTournament.findMany({
        select: { id: true },
        take: 25,
        orderBy: { id: "asc" },
        where: {
          ...(this.activeCursor ? { id: { gt: this.activeCursor } } : {}),
          automaticBracket: true,
          bracketGeneratedAt: { not: null },
          status: "IN_PROGRESS"
        }
      });
      this.activeCursor = active.length === 25 ? active.at(-1)?.id : undefined;
      for (const item of active)
        await this.reconcile(item.id).catch((error: unknown) =>
          this.logger.error("Could not advance tournament bracket", error)
        );
    } catch (error) {
      this.logger.error("Could not scan tournament brackets", error);
    } finally {
      this.scanning = false;
    }
  }
}
