import { Injectable } from "@nestjs/common";
import type {
  ContributionPolicy,
  ContributionStatus,
  ContributionType,
  ContributionVoteKind,
  Entity,
  EntityContribution,
  EntityFieldProvenance,
  Prisma
} from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import { pickTitleSearchTokens } from "../utils/title-match-tokens.js";

export interface CreateContributionRecordInput {
  authorId: string;
  entityId: string;
  payload: Prisma.InputJsonValue;
  tier: "AUTO" | "MODERATION";
  type: ContributionType;
}

@Injectable()
export class ContributionsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findEntityById(id: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({ where: { id } });
  }

  async findEntitiesByIds(ids: string[]): Promise<Entity[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.prismaService.entity.findMany({
      where: { id: { in: ids } }
    });
  }

  async findPolicy(type: ContributionType): Promise<ContributionPolicy | null> {
    return this.prismaService.contributionPolicy.findUnique({ where: { type } });
  }

  async countContributionsByAuthorSince(authorId: string, since: Date): Promise<number> {
    return this.prismaService.entityContribution.count({
      where: {
        authorId,
        createdAt: { gte: since }
      }
    });
  }

  async supersedePendingContributions(entityId: string, type: ContributionType): Promise<void> {
    await this.prismaService.entityContribution.updateMany({
      data: {
        resolvedAt: new Date(),
        status: "SUPERSEDED"
      },
      where: {
        entityId,
        status: "PENDING",
        type
      }
    });
  }

  async createContribution(input: CreateContributionRecordInput): Promise<EntityContribution> {
    return this.prismaService.entityContribution.create({
      data: {
        authorId: input.authorId,
        entityId: input.entityId,
        payload: input.payload,
        tier: input.tier,
        type: input.type
      }
    });
  }

  async findContributionById(id: string): Promise<
    | (EntityContribution & {
        votes: Array<{ kind: ContributionVoteKind; voterId: string; weight: Prisma.Decimal }>;
      })
    | null
  > {
    return this.prismaService.entityContribution.findUnique({
      include: {
        votes: {
          select: {
            kind: true,
            voterId: true,
            weight: true
          }
        }
      },
      where: { id }
    });
  }

  async listContributionsByEntity(
    entityId: string,
    status?: ContributionStatus
  ): Promise<EntityContribution[]> {
    return this.prismaService.entityContribution.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        entityId,
        ...(status ? { status } : {})
      }
    });
  }

  async upsertVote(input: {
    contributionId: string;
    kind: ContributionVoteKind;
    voterId: string;
    weight: number;
  }): Promise<void> {
    await this.prismaService.contributionVote.upsert({
      create: {
        contributionId: input.contributionId,
        kind: input.kind,
        voterId: input.voterId,
        weight: input.weight
      },
      update: {
        kind: input.kind,
        weight: input.weight
      },
      where: {
        contributionId_voterId: {
          contributionId: input.contributionId,
          voterId: input.voterId
        }
      }
    });
  }

  async refreshContributionWeights(contributionId: string): Promise<{
    approvalsWeight: number;
    rejectionsWeight: number;
    uniqueApprovers: number;
    uniqueRejecters: number;
  }> {
    const votes = await this.prismaService.contributionVote.findMany({
      where: { contributionId }
    });

    let approvalsWeight = 0;
    let rejectionsWeight = 0;
    let uniqueApprovers = 0;
    let uniqueRejecters = 0;

    for (const vote of votes) {
      const weight = Number(vote.weight);

      if (vote.kind === "APPROVE") {
        approvalsWeight += weight;
        uniqueApprovers += 1;
      } else {
        rejectionsWeight += weight;
        uniqueRejecters += 1;
      }
    }

    await this.prismaService.entityContribution.update({
      data: {
        approvalsWeight,
        rejectionsWeight
      },
      where: { id: contributionId }
    });

    return {
      approvalsWeight,
      rejectionsWeight,
      uniqueApprovers,
      uniqueRejecters
    };
  }

  async updateContributionStatus(input: {
    contributionId: string;
    resolvedBy?: string | null;
    status: ContributionStatus;
  }): Promise<EntityContribution> {
    const now = new Date();
    const data: Prisma.EntityContributionUpdateInput = {
      resolvedAt: now,
      resolvedBy: input.resolvedBy ?? null,
      status: input.status
    };

    if (input.status === "APPLIED") {
      data.appliedAt = now;
    }

    return this.prismaService.entityContribution.update({
      data,
      where: { id: input.contributionId }
    });
  }

  async getEntityVotesCount(entityId: string): Promise<number> {
    const aggregate = await this.prismaService.ratingAggregate.findUnique({
      where: { entityId }
    });

    return aggregate?.votesCount ?? 0;
  }

  async upsertFieldProvenance(input: {
    contributionId: string;
    entityId: string;
    field: string;
    source: "community" | "author" | "system";
    votersCount: number;
  }): Promise<EntityFieldProvenance> {
    return this.prismaService.entityFieldProvenance.upsert({
      create: {
        confirmedAt: new Date(),
        contributionId: input.contributionId,
        entityId: input.entityId,
        field: input.field,
        source: input.source,
        votersCount: input.votersCount
      },
      update: {
        confirmedAt: new Date(),
        contributionId: input.contributionId,
        source: input.source,
        votersCount: input.votersCount
      },
      where: {
        entityId_field: {
          entityId: input.entityId,
          field: input.field
        }
      }
    });
  }

  async listFieldProvenance(entityId: string): Promise<EntityFieldProvenance[]> {
    return this.prismaService.entityFieldProvenance.findMany({
      where: { entityId }
    });
  }

  async findDuplicateCandidates(entityId: string, title: string): Promise<Entity[]> {
    const normalizedTitle = title.trim();
    const titleTokens = pickTitleSearchTokens(normalizedTitle);
    const slugPattern = normalizedTitle.toLowerCase().replace(/\s+/g, "-");

    const titleFilters = [
      {
        title: {
          contains: normalizedTitle,
          mode: "insensitive" as const
        }
      },
      ...(slugPattern.length >= 2
        ? [
            {
              slug: {
                contains: slugPattern,
                mode: "insensitive" as const
              }
            }
          ]
        : []),
      ...titleTokens.map((token) => ({
        title: {
          contains: token,
          mode: "insensitive" as const
        }
      }))
    ];

    return this.prismaService.entity.findMany({
      take: 30,
      where: {
        id: { not: entityId },
        visibility: "ACTIVE",
        OR: titleFilters
      }
    });
  }

  async updateEntityField(
    entityId: string,
    data: Partial<Pick<Entity, "canonicalUrl" | "description" | "logoUrl" | "title" | "type">>
  ): Promise<Entity> {
    return this.prismaService.entity.update({
      data,
      where: { id: entityId }
    });
  }

  async findEntityByCanonicalUrl(canonicalUrl: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: { canonicalUrl }
    });
  }

  async listContributionsForAdmin(input: {
    cursor?: string;
    limit: number;
    status: ContributionStatus;
    type?: ContributionType;
  }): Promise<EntityContribution[]> {
    const where: Prisma.EntityContributionWhereInput = {
      status: input.status,
      ...(input.type ? { type: input.type } : {})
    };

    if (input.cursor) {
      const [createdAtRaw, id] = input.cursor.split("|");
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : undefined;

      if (createdAt && id) {
        where.OR = [
          { createdAt: { lt: createdAt } },
          {
            AND: [{ createdAt }, { id: { lt: id } }]
          }
        ];
      }
    }

    return this.prismaService.entityContribution.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      where
    });
  }

  async countContributionsByStatusSince(
    status: ContributionStatus,
    since: Date
  ): Promise<number> {
    return this.prismaService.entityContribution.count({
      where: {
        resolvedAt: { gte: since },
        status
      }
    });
  }

  async countPendingContributions(type?: ContributionType): Promise<number> {
    return this.prismaService.entityContribution.count({
      where: {
        status: "PENDING",
        ...(type ? { type } : {})
      }
    });
  }

  async groupPendingContributionsByType(): Promise<Array<{ type: ContributionType; count: number }>> {
    const rows = await this.prismaService.entityContribution.groupBy({
      _count: { _all: true },
      by: ["type"],
      where: { status: "PENDING" }
    });

    return rows.map((row) => ({
      count: row._count._all,
      type: row.type
    }));
  }

  async findOldestPendingContribution(): Promise<EntityContribution | null> {
    return this.prismaService.entityContribution.findFirst({
      orderBy: { createdAt: "asc" },
      where: { status: "PENDING" }
    });
  }

  async groupAuthorContributionsByStatus(
    authorId: string
  ): Promise<Array<{ status: ContributionStatus; count: number }>> {
    const rows = await this.prismaService.entityContribution.groupBy({
      _count: { _all: true },
      by: ["status"],
      where: { authorId }
    });

    return rows.map((row) => ({
      count: row._count._all,
      status: row.status
    }));
  }
}
