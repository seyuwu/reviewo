import { Injectable } from "@nestjs/common";
import type { ActivityEvent, Prisma } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface AppendActivityEventInput {
  actionType: string;
  categoryId?: string | null;
  createdAt?: Date;
  entityId?: string | null;
  entityType?: string | null;
  payload?: Record<string, unknown>;
  sourceId?: string;
  targetUserId?: string | null;
  userId: string;
}

@Injectable()
export class ActivityEventsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async countAll(): Promise<number> {
    return this.prismaService.activityEvent.count();
  }

  async append(input: AppendActivityEventInput): Promise<ActivityEvent | null> {
    if (input.sourceId) {
      const existing = await this.prismaService.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM community.activity_events
        WHERE user_id = ${input.userId}::uuid
          AND action_type = ${input.actionType}
          AND payload->>'sourceId' = ${input.sourceId}
        LIMIT 1
      `;

      if (existing.length > 0) {
        return null;
      }
    }

    try {
      return await this.prismaService.activityEvent.create({
        data: {
          actionType: input.actionType,
          categoryId: input.categoryId ?? null,
          entityId: input.entityId ?? null,
          entityType: input.entityType ?? null,
          payload: {
            ...(input.payload ?? {}),
            ...(input.sourceId ? { sourceId: input.sourceId } : {})
          } as Prisma.InputJsonValue,
          targetUserId: input.targetUserId ?? null,
          userId: input.userId,
          ...(input.createdAt ? { createdAt: input.createdAt } : {})
        }
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  async countByUserGrouped(userId: string): Promise<Map<string, number>> {
    const rows = await this.prismaService.activityEvent.groupBy({
      _count: {
        _all: true
      },
      by: ["actionType"],
      where: {
        userId
      }
    });

    return new Map(rows.map((row) => [row.actionType, row._count._all]));
  }

  async getLastActivityAt(userId: string): Promise<Date | null> {
    const latest = await this.prismaService.activityEvent.findFirst({
      orderBy: {
        createdAt: "desc"
      },
      select: {
        createdAt: true
      },
      where: {
        userId
      }
    });

    return latest?.createdAt ?? null;
  }

  async listByUserId(userId: string) {
    return this.prismaService.activityEvent.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        actionType: true,
        categoryId: true,
        createdAt: true,
        entityType: true
      },
      where: { userId }
    });
  }

  async countByActionType(userId: string, actionType: string): Promise<number> {
    return this.prismaService.activityEvent.count({
      where: {
        actionType,
        userId
      }
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
