import { Injectable } from "@nestjs/common";
import type { EntityChatMessage, Prisma } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface CreateEntityChatMessageInput {
  entityId: string;
  message: string;
  userId: string;
}

export interface ActiveNowAggregateRow {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  lastMessageAt: Date;
  messageCount: bigint;
  participantCount: bigint;
  previewMessage: string | null;
}

const DEFAULT_MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGE_SIZE = 100;
const ACTIVE_NOW_WINDOW_MINUTES = 30;
const RETENTION_DAYS = 90;
const MAX_MESSAGES_PER_ENTITY = 5000;

@Injectable()
export class EntityChatRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createMessage(input: CreateEntityChatMessageInput): Promise<EntityChatMessage> {
    return this.prismaService.entityChatMessage.create({
      data: {
        entityId: input.entityId,
        message: input.message.trim(),
        userId: input.userId
      }
    });
  }

  async findMessageById(messageId: string): Promise<EntityChatMessage | null> {
    return this.prismaService.entityChatMessage.findUnique({
      where: {
        id: messageId
      }
    });
  }

  async listLatestMessages(entityId: string, limit = DEFAULT_MESSAGE_PAGE_SIZE): Promise<EntityChatMessage[]> {
    const pageSize = clampPageSize(limit);

    return this.prismaService.entityChatMessage.findMany({
      where: {
        entityId,
        isHidden: false
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize
    });
  }

  async listMessagesBeforeCursor(
    entityId: string,
    beforeMessageId: string,
    limit = DEFAULT_MESSAGE_PAGE_SIZE
  ): Promise<EntityChatMessage[]> {
    const pageSize = clampPageSize(limit);
    const cursorMessage = await this.findMessageById(beforeMessageId);

    if (!cursorMessage || cursorMessage.entityId !== entityId) {
      return [];
    }

    return this.prismaService.entityChatMessage.findMany({
      where: {
        entityId,
        isHidden: false,
        OR: [
          {
            createdAt: {
              lt: cursorMessage.createdAt
            }
          },
          {
            createdAt: cursorMessage.createdAt,
            id: {
              lt: cursorMessage.id
            }
          }
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize
    });
  }

  async listMessagesWithAuthors(
    entityId: string,
    beforeMessageId?: string,
    limit = DEFAULT_MESSAGE_PAGE_SIZE
  ): Promise<
    Array<
      EntityChatMessage & {
        user: {
          displayName: string;
        };
      }
    >
  > {
    const pageSize = clampPageSize(limit);
    const where: Prisma.EntityChatMessageWhereInput = {
      entityId,
      isHidden: false
    };

    if (beforeMessageId) {
      const cursorMessage = await this.findMessageById(beforeMessageId);

      if (!cursorMessage || cursorMessage.entityId !== entityId) {
        return [];
      }

      where.OR = [
        {
          createdAt: {
            lt: cursorMessage.createdAt
          }
        },
        {
          createdAt: cursorMessage.createdAt,
          id: {
            lt: cursorMessage.id
          }
        }
      ];
    }

    return this.prismaService.entityChatMessage.findMany({
      include: {
        user: {
          select: {
            displayName: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      where
    });
  }

  async findActiveNowAggregates(limit: number): Promise<ActiveNowAggregateRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const windowStart = new Date(Date.now() - ACTIVE_NOW_WINDOW_MINUTES * 60_000);

    return this.prismaService.$queryRaw<ActiveNowAggregateRow[]>`
      SELECT
        m.entity_id AS "entityId",
        e.title AS "entityTitle",
        e.slug AS "entitySlug",
        COUNT(*)::bigint AS "messageCount",
        COUNT(DISTINCT m.user_id)::bigint AS "participantCount",
        MAX(m.created_at) AS "lastMessageAt",
        (
          SELECT preview.message
          FROM chat.entity_chat_messages preview
          WHERE preview.entity_id = m.entity_id
            AND preview.is_hidden = false
            AND preview.created_at >= ${windowStart}
          ORDER BY preview.created_at DESC
          LIMIT 1
        ) AS "previewMessage"
      FROM chat.entity_chat_messages m
      INNER JOIN entities.entities e ON e.id = m.entity_id
      WHERE m.is_hidden = false
        AND m.created_at >= ${windowStart}
        AND e.visibility = 'ACTIVE'
      GROUP BY m.entity_id, e.title, e.slug
      HAVING COUNT(*) >= 2
      ORDER BY
        (COUNT(*) * 2 + COUNT(DISTINCT m.user_id)) DESC,
        MAX(m.created_at) DESC
      LIMIT ${safeLimit}
    `;
  }

  async cleanupOldMessages(): Promise<{ deletedByAge: number; trimmedByEntity: number }> {
    const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const deletedByAge = await this.prismaService.entityChatMessage.deleteMany({
      where: {
        createdAt: {
          lt: retentionCutoff
        }
      }
    });

    const entityIds = await this.prismaService.entityChatMessage.findMany({
      distinct: ["entityId"],
      select: {
        entityId: true
      }
    });

    let trimmedByEntity = 0;

    for (const { entityId } of entityIds) {
      const overflow = await this.prismaService.entityChatMessage.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true
        },
        skip: MAX_MESSAGES_PER_ENTITY,
        take: 500,
        where: {
          entityId
        }
      });

      if (overflow.length === 0) {
        continue;
      }

      const result = await this.prismaService.entityChatMessage.deleteMany({
        where: {
          id: {
            in: overflow.map((row) => row.id)
          }
        }
      });

      trimmedByEntity += result.count;
    }

    return {
      deletedByAge: deletedByAge.count,
      trimmedByEntity
    };
  }
}

function clampPageSize(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_MESSAGE_PAGE_SIZE;
  }

  return Math.max(1, Math.min(Math.floor(limit), MAX_MESSAGE_PAGE_SIZE));
}
