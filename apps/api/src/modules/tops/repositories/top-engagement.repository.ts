import { Injectable } from "@nestjs/common";
import type { TopComment } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export type TopCommentRow = TopComment;

@Injectable()
export class TopEngagementRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async isLikedByUser(topId: string, userId: string): Promise<boolean> {
    const like = await this.prismaService.topLike.findUnique({
      where: {
        topId_userId: {
          topId,
          userId
        }
      }
    });

    return like !== null;
  }

  async toggleLike(topId: string, userId: string): Promise<{ likeId?: string; liked: boolean }> {
    const existing = await this.prismaService.topLike.findUnique({
      where: {
        topId_userId: {
          topId,
          userId
        }
      }
    });

    if (existing) {
      await this.prismaService.topLike.delete({
        where: {
          topId_userId: {
            topId,
            userId
          }
        }
      });

      return { liked: false };
    }

    const created = await this.prismaService.topLike.create({
      data: {
        topId,
        userId
      }
    });

    return { likeId: created.id, liked: true };
  }

  async countLikes(topId: string): Promise<number> {
    return this.prismaService.topLike.count({
      where: { topId }
    });
  }

  async recordView(
    topId: string,
    viewerKey: string,
    userId?: string
  ): Promise<{ recorded: boolean }> {
    try {
      await this.prismaService.topView.create({
        data: {
          topId,
          userId: userId ?? null,
          viewerKey
        }
      });

      return { recorded: true };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return { recorded: false };
      }

      throw error;
    }
  }

  async countViews(topId: string): Promise<number> {
    return this.prismaService.topView.count({
      where: { topId }
    });
  }

  async countComments(topId: string): Promise<number> {
    return this.prismaService.topComment.count({
      where: {
        topId,
        visibility: "ACTIVE"
      }
    });
  }

  async createComment(topId: string, authorId: string, text: string): Promise<TopCommentRow> {
    return this.prismaService.topComment.create({
      data: {
        authorId,
        text,
        topId
      }
    });
  }

  async listComments(params: {
    cursor?: string;
    limit: number;
    topId: string;
  }): Promise<{ items: TopCommentRow[]; nextCursor: string | null }> {
    const rows = await this.prismaService.topComment.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: params.limit + 1,
      where: {
        topId: params.topId,
        visibility: "ACTIVE",
        ...(params.cursor
          ? {
              OR: [
                {
                  createdAt: {
                    gt: decodeCursor(params.cursor).createdAt
                  }
                },
                {
                  AND: [
                    {
                      createdAt: decodeCursor(params.cursor).createdAt
                    },
                    {
                      id: {
                        gt: decodeCursor(params.cursor).id
                      }
                    }
                  ]
                }
              ]
            }
          : {})
      }
    });

    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt,
              id: last.id
            })
          : null
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}

function encodeCursor(value: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: value.createdAt.toISOString(),
      id: value.id
    })
  ).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    createdAt: string;
    id: string;
  };

  return {
    createdAt: new Date(parsed.createdAt),
    id: parsed.id
  };
}
