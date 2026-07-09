import { Injectable } from "@nestjs/common";
import { EntityVisibility } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface MergeEntitiesInput {
  moderatorId: string;
  sourceEntityId: string;
  targetEntityId: string;
}

@Injectable()
export class EntityMergeService {
  constructor(private readonly prismaService: PrismaService) {}

  async mergeEntities(input: MergeEntitiesInput): Promise<{ targetEntityId: string }> {
    if (input.sourceEntityId === input.targetEntityId) {
      throw new Error("Cannot merge entity into itself");
    }

    return this.prismaService.$transaction(async (transaction) => {
      const [source, target] = await Promise.all([
        transaction.entity.findUnique({ where: { id: input.sourceEntityId } }),
        transaction.entity.findUnique({ where: { id: input.targetEntityId } })
      ]);

      if (!source || !target) {
        throw new Error("Source or target entity was not found");
      }

      if (source.visibility !== EntityVisibility.ACTIVE || target.visibility !== EntityVisibility.ACTIVE) {
        throw new Error("Both entities must be active to merge");
      }

      await this.mergeTopItems(transaction, input.sourceEntityId, input.targetEntityId);
      await this.mergeRatings(transaction, input.sourceEntityId, input.targetEntityId);
      await this.mergeReviews(transaction, input.sourceEntityId, input.targetEntityId);
      await this.mergeBattleVotes(transaction, input.sourceEntityId, input.targetEntityId);
      await this.mergeChatMessages(transaction, input.sourceEntityId, input.targetEntityId);
      await this.mergeReputationRows(transaction, input.sourceEntityId, input.targetEntityId);
      await transaction.entity.updateMany({
        data: { parentId: input.targetEntityId },
        where: { parentId: input.sourceEntityId }
      });

      if (!target.canonicalUrl && source.canonicalUrl) {
        const urlOwner = await transaction.entity.findUnique({
          where: { canonicalUrl: source.canonicalUrl }
        });

        if (!urlOwner || urlOwner.id === source.id) {
          await transaction.entity.update({
            data: { canonicalUrl: source.canonicalUrl },
            where: { id: input.targetEntityId }
          });
        }
      }

      if (!target.description && source.description) {
        await transaction.entity.update({
          data: { description: source.description },
          where: { id: input.targetEntityId }
        });
      }

      await transaction.entity.update({
        data: { visibility: EntityVisibility.HIDDEN },
        where: { id: input.sourceEntityId }
      });

      return { targetEntityId: input.targetEntityId };
    });
  }

  private async mergeTopItems(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    const sourceItems = await transaction.topItem.findMany({
      where: { entityId: sourceEntityId }
    });

    for (const item of sourceItems) {
      const existingTargetItem = await transaction.topItem.findUnique({
        where: {
          topId_entityId: {
            entityId: targetEntityId,
            topId: item.topId
          }
        }
      });

      if (existingTargetItem) {
        await transaction.topItem.delete({ where: { id: item.id } });
        continue;
      }

      await transaction.topItem.update({
        data: { entityId: targetEntityId },
        where: { id: item.id }
      });
    }
  }

  private async mergeRatings(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    const sourceRatings = await transaction.rating.findMany({
      where: { entityId: sourceEntityId }
    });

    for (const rating of sourceRatings) {
      const existing = await transaction.rating.findUnique({
        where: {
          entityId_userId: {
            entityId: targetEntityId,
            userId: rating.userId
          }
        }
      });

      if (!existing) {
        await transaction.rating.update({
          data: { entityId: targetEntityId },
          where: { id: rating.id }
        });
        continue;
      }

      if (rating.updatedAt > existing.updatedAt) {
        await transaction.rating.update({
          data: { score: rating.score, source: rating.source },
          where: { id: existing.id }
        });
      }

      await transaction.rating.delete({ where: { id: rating.id } });
    }

    await this.recalculateRatingAggregate(transaction, targetEntityId);
    await transaction.ratingAggregate.deleteMany({ where: { entityId: sourceEntityId } });
  }

  private async mergeReviews(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    const sourceReviews = await transaction.review.findMany({
      where: { entityId: sourceEntityId }
    });

    for (const review of sourceReviews) {
      const existing = await transaction.review.findUnique({
        where: {
          authorId_entityId: {
            authorId: review.authorId,
            entityId: targetEntityId
          }
        }
      });

      if (!existing) {
        await transaction.review.update({
          data: { entityId: targetEntityId },
          where: { id: review.id }
        });
        continue;
      }

      if (review.updatedAt > existing.updatedAt) {
        await transaction.review.update({
          data: { text: review.text, visibility: review.visibility },
          where: { id: existing.id }
        });
      }

      await transaction.review.delete({ where: { id: review.id } });
    }
  }

  private async mergeBattleVotes(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    await transaction.battleVote.updateMany({
      data: { entityId: targetEntityId },
      where: { entityId: sourceEntityId }
    });
  }

  private async mergeChatMessages(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    await transaction.entityChatMessage.updateMany({
      data: { entityId: targetEntityId },
      where: { entityId: sourceEntityId }
    });
  }

  private async mergeReputationRows(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    const sourceStats = await transaction.userEntityStats.findMany({
      where: { entityId: sourceEntityId }
    });

    for (const stat of sourceStats) {
      const existing = await transaction.userEntityStats.findUnique({
        where: {
          userId_entityId: {
            entityId: targetEntityId,
            userId: stat.userId
          }
        }
      });

      if (!existing) {
        await transaction.userEntityStats.update({
          data: { entityId: targetEntityId },
          where: {
            userId_entityId: {
              entityId: sourceEntityId,
              userId: stat.userId
            }
          }
        });
        continue;
      }

      if (stat.lastRatedAt > existing.lastRatedAt) {
        await transaction.userEntityStats.update({
          data: {
            lastRatedAt: stat.lastRatedAt,
            ratingCount: existing.ratingCount + stat.ratingCount
          },
          where: {
            userId_entityId: {
              entityId: targetEntityId,
              userId: stat.userId
            }
          }
        });
      }

      await transaction.userEntityStats.delete({
        where: {
          userId_entityId: {
            entityId: sourceEntityId,
            userId: stat.userId
          }
        }
      });
    }

    await transaction.entityActivityHourly.deleteMany({
      where: { entityId: sourceEntityId }
    });
    await transaction.entityAnomalyMetrics.deleteMany({
      where: { entityId: sourceEntityId }
    });
    await transaction.entityConfidenceProfile.deleteMany({
      where: { entityId: sourceEntityId }
    });
    await transaction.reputationEvent.updateMany({
      data: { entityId: targetEntityId },
      where: { entityId: sourceEntityId }
    });
    await transaction.voteWeightSnapshot.updateMany({
      data: { entityId: targetEntityId },
      where: { entityId: sourceEntityId }
    });
  }

  private async recalculateRatingAggregate(
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    entityId: string
  ): Promise<void> {
    const ratings = await transaction.rating.findMany({ where: { entityId } });
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const rating of ratings) {
      distribution[rating.score as 1 | 2 | 3 | 4 | 5] += 1;
    }

    const votesCount = ratings.length;
    const avgScore =
      votesCount === 0
        ? 0
        : ratings.reduce((sum, rating) => sum + rating.score, 0) / votesCount;

    await transaction.ratingAggregate.upsert({
      create: {
        avgScore,
        distribution1: distribution[1],
        distribution2: distribution[2],
        distribution3: distribution[3],
        distribution4: distribution[4],
        distribution5: distribution[5],
        entityId,
        votesCount
      },
      update: {
        avgScore,
        distribution1: distribution[1],
        distribution2: distribution[2],
        distribution3: distribution[3],
        distribution4: distribution[4],
        distribution5: distribution[5],
        votesCount
      },
      where: { entityId }
    });
  }
}
