import { Injectable } from "@nestjs/common";
import type { EntityChatMessage, Prisma } from "#prisma/client";
import type { EntityChatLocale } from "@reviewo/shared";

import { PrismaService } from "../../../database/prisma.service.js";

export interface CreateEntityChatMessageInput {
  entityId: string;
  locale: EntityChatLocale;
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
        locale: input.locale,
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

  async listLatestMessages(
    entityId: string,
    locale: EntityChatLocale,
    limit = DEFAULT_MESSAGE_PAGE_SIZE
  ): Promise<EntityChatMessage[]> {
    const pageSize = clampPageSize(limit);

    return this.prismaService.entityChatMessage.findMany({
      where: {
        entityId,
        isHidden: false,
        locale
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize
    });
  }

  async listMessagesBeforeCursor(
    entityId: string,
    locale: EntityChatLocale,
    beforeMessageId: string,
    limit = DEFAULT_MESSAGE_PAGE_SIZE
  ): Promise<EntityChatMessage[]> {
    const pageSize = clampPageSize(limit);
    const cursorMessage = await this.findMessageById(beforeMessageId);

    if (!cursorMessage || cursorMessage.entityId !== entityId || cursorMessage.locale !== locale) {
      return [];
    }

    return this.prismaService.entityChatMessage.findMany({
      where: {
        entityId,
        isHidden: false,
        locale,
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
    locale: EntityChatLocale,
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
      isHidden: false,
      locale
    };

    if (beforeMessageId) {
      const cursorMessage = await this.findMessageById(beforeMessageId);

      if (!cursorMessage || cursorMessage.entityId !== entityId || cursorMessage.locale !== locale) {
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
    return this.findDiscussionAggregates(limit, ACTIVE_NOW_WINDOW_MINUTES, 2);
  }

  async findRecentDiscussionAggregates(limit: number, windowDays = 7): Promise<ActiveNowAggregateRow[]> {
    return this.findDiscussionAggregates(limit, windowDays * 24 * 60, 1);
  }

  private async findDiscussionAggregates(
    limit: number,
    windowMinutes: number,
    minMessages: number
  ): Promise<ActiveNowAggregateRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const windowStart = new Date(Date.now() - windowMinutes * 60_000);

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
        AND e.visibility = 'ACTIVE'::entities.entity_visibility
      GROUP BY m.entity_id, e.title, e.slug
      HAVING COUNT(*) >= ${minMessages}
      ORDER BY
        MAX(m.created_at) DESC,
        (COUNT(*) * 2 + COUNT(DISTINCT m.user_id)) DESC
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

    const entityLocales = await this.prismaService.entityChatMessage.findMany({
      distinct: ["entityId", "locale"],
      select: {
        entityId: true,
        locale: true
      }
    });

    let trimmedByEntity = 0;

    for (const { entityId, locale } of entityLocales) {
      const overflow = await this.prismaService.entityChatMessage.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true
        },
        skip: MAX_MESSAGES_PER_ENTITY,
        take: 500,
        where: {
          entityId,
          locale
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
