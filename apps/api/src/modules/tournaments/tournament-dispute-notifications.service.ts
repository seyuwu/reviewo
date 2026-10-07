import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";

const MANAGER_ROLES = ["ADMIN", "TOURNAMENT_MODERATOR"] as const;

@Injectable()
export class TournamentDisputeNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    if (user.status !== "active" || !MANAGER_ROLES.some((role) => role === user.role)) return { items: [], count: 0 };
    const where = { status: "DISPUTED" as const };
    const [count, matches] = await Promise.all([
      this.prisma.dotaTournamentMatch.count({ where }),
      this.prisma.dotaTournamentMatch.findMany({ where, take: 50, orderBy: { updatedAt: "desc" },
        select: { id: true, updatedAt: true, disputeNotifiedAt: true, disputeReason: true,
          tournament: { select: { slug: true, title: true } },
          entryA: { select: { teamNameSnapshot: true } }, entryB: { select: { teamNameSnapshot: true } } }
      })
    ]);
    return { count, items: matches.map((match) => ({
      id: match.id, eventId: match.id + ":" + match.updatedAt.toISOString(),
      tournamentTitle: match.tournament.title,
      teams: match.entryA.teamNameSnapshot + " — " + match.entryB.teamNameSnapshot,
      reason: match.disputeReason ?? "",
      href: "/games/tournaments/" + encodeURIComponent(match.tournament.slug) + "/matches/" + match.id
    })) };
  }

}
