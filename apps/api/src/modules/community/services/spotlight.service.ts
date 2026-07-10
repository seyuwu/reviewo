import { HttpStatus, Injectable } from "@nestjs/common";
import { buildPairKey, parseCompareSlug } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER } from "../constants/spotlight-credits.js";
import { resolveEntityRecommendationPitch } from "../lib/resolve-entity-recommendation-pitch.js";
import {
  matchesRecommendationLocale,
  resolveRecommendationLocale
} from "../lib/resolve-recommendation-locale.js";
import { resolveSpotlightSpend } from "../lib/resolve-spotlight-spend.js";
import type {
  CreateSpotlightBattleDto,
  CreateSpotlightEntityDto,
  CreateSpotlightTopDto,
  SpotlightFeedResponseDto,
  SpotlightPlacementDto,
  SpendSpotlightResponseDto
} from "../dto/spotlight.dto.js";
import {
  attachRecommendationToPlacement,
  buildRecommendationDto,
  type AuthorReviewRow,
  type EntityRatingRow,
  type SpotlightContentLocale,
  pickAuthorReview
} from "../lib/spotlight-recommendation.mapper.js";
import type { SpotlightPlacementRow } from "../repositories/spotlight-placements.repository.js";
import { SpotlightPlacementsRepository } from "../repositories/spotlight-placements.repository.js";
import { RecommendationEndorsementsRepository } from "../../recommendation/repositories/recommendation-endorsements.repository.js";
import { SpotlightCreditsService } from "./spotlight-credits.service.js";

type SpotlightFeedEntity = {
  canonicalUrl: string | null;
  id: string;
  logoUrl: string | null;
  slug: string;
  title: string;
};
type SpotlightFeedTop = { id: string; slug: string; title: string };
type SpotlightFeedRecommendation = {
  id: string;
  locale: string;
  message: string | null;
  review: { id: string; text: string } | null;
  reviewId: string | null;
};

@Injectable()
export class SpotlightService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly recommendationEndorsementsRepository: RecommendationEndorsementsRepository,
    private readonly spotlightCreditsService: SpotlightCreditsService,
    private readonly spotlightPlacementsRepository: SpotlightPlacementsRepository
  ) {}

  async getFeed(
    limit = 30,
    locale: SpotlightContentLocale = "ru",
    viewerUserId?: string
  ): Promise<SpotlightFeedResponseDto> {
    const fetchLimit = locale === "all" ? limit : Math.min(limit * 3, 100);
    const rawPlacements = await this.spotlightPlacementsRepository.listActive(fetchLimit);
    const recommendationIds = rawPlacements.map((placement) => placement.recommendationId);
    const recommendationLocales =
      recommendationIds.length > 0
        ? await this.prismaService.communityRecommendation.findMany({
            select: { id: true, locale: true },
            where: { id: { in: recommendationIds } }
          })
        : [];
    const localeByRecommendationId = new Map(
      recommendationLocales.map((recommendation) => [recommendation.id, recommendation.locale])
    );
    const placements = rawPlacements
      .filter((placement) =>
        matchesRecommendationLocale(
          localeByRecommendationId.get(placement.recommendationId) ?? "ru",
          locale
        )
      )
      .slice(0, limit);
    const entityIds = placements
      .map((placement) => placement.entityId)
      .filter((entityId): entityId is string => Boolean(entityId));
    const topIds = placements
      .map((placement) => placement.topId)
      .filter((topId): topId is string => Boolean(topId));

    const entityPlacements = placements.filter(
      (placement) => placement.placementType === "entity_spotlight" && placement.entityId
    );
    const authorEntityPairs = entityPlacements.map((placement) => ({
      authorId: placement.userId,
      entityId: placement.entityId as string
    }));

    const filteredRecommendationIds = placements.map((placement) => placement.recommendationId);
    const [
      entities,
      tops,
      reviews,
      ratingAggregates,
      recommendations,
      endorsementCounts,
      viewerEndorsedIds
    ] = await Promise.all([
      entityIds.length > 0
        ? this.prismaService.entity.findMany({
            select: {
              canonicalUrl: true,
              id: true,
              logoUrl: true,
              slug: true,
              title: true
            },
            where: { id: { in: entityIds }, visibility: "ACTIVE" }
          })
        : ([] as SpotlightFeedEntity[]),
      topIds.length > 0
        ? this.prismaService.top.findMany({
            select: { id: true, slug: true, title: true },
            where: { id: { in: topIds }, visibility: "ACTIVE" }
          })
        : ([] as SpotlightFeedTop[]),
      authorEntityPairs.length > 0
        ? this.prismaService.review.findMany({
            select: {
              authorId: true,
              entityId: true,
              id: true,
              locale: true,
              text: true
            },
            where: {
              OR: authorEntityPairs.map((pair) => ({
                authorId: pair.authorId,
                entityId: pair.entityId
              })),
              visibility: "ACTIVE"
            }
          })
        : ([] as AuthorReviewRow[]),
      entityIds.length > 0
        ? this.prismaService.ratingAggregate.findMany({
            select: {
              avgScore: true,
              entityId: true,
              votesCount: true
            },
            where: { entityId: { in: entityIds } }
          })
        : ([] as Array<{ avgScore: unknown; entityId: string; votesCount: number }>),
      filteredRecommendationIds.length > 0
        ? this.prismaService.communityRecommendation.findMany({
            select: {
              id: true,
              locale: true,
              message: true,
              review: {
                select: {
                  id: true,
                  text: true
                }
              },
              reviewId: true
            },
            where: { id: { in: filteredRecommendationIds } }
          })
        : ([] as SpotlightFeedRecommendation[]),
      this.recommendationEndorsementsRepository.countByRecommendationIds(filteredRecommendationIds),
      viewerUserId
        ? this.recommendationEndorsementsRepository.listViewerEndorsedRecommendationIds(
            filteredRecommendationIds,
            viewerUserId
          )
        : Promise.resolve(new Set<string>())
    ]);

    const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
    const topsById = new Map(tops.map((top) => [top.id, top]));
    const reviewsByPair = groupReviewsByPair(reviews as AuthorReviewRow[]);
    const ratingsByEntityId = new Map(
      ratingAggregates.map((aggregate) => [
        aggregate.entityId,
        {
          avgScore: Number(aggregate.avgScore),
          entityId: aggregate.entityId,
          votesCount: aggregate.votesCount
        } satisfies EntityRatingRow
      ])
    );
    const recommendationsById = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation]));

    return {
      items: placements.map((placement) => {
        const recommendation = recommendationsById.get(placement.recommendationId);
        const storedReview = recommendation?.review
          ? { id: recommendation.review.id, text: recommendation.review.text }
          : null;
        const storedMessage = recommendation?.message ?? null;
        const enrichment: {
          endorsementsCount: number;
          locale: SpotlightContentLocale;
          ratingsByEntityId: Map<string, EntityRatingRow>;
          reviewsByPair: Map<string, AuthorReviewRow[]>;
          storedMessage?: string | null;
          storedReview?: { id: string; text: string } | null;
          viewerCanEndorse?: boolean;
          viewerHasEndorsed?: boolean;
        } = {
          endorsementsCount: endorsementCounts.get(placement.recommendationId) ?? 0,
          locale,
          ratingsByEntityId,
          reviewsByPair,
          storedMessage,
          storedReview
        };

        if (viewerUserId) {
          enrichment.viewerCanEndorse = placement.userId !== viewerUserId;
          enrichment.viewerHasEndorsed = viewerEndorsedIds.has(placement.recommendationId);
        }

        return this.toEnrichedPlacementDto(placement, entitiesById, topsById, enrichment);
      })
    };
  }

  async spendOnEntity(
    userId: string,
    input: CreateSpotlightEntityDto
  ): Promise<SpendSpotlightResponseDto> {
    const entity = await this.prismaService.entity.findUnique({
      select: {
        canonicalUrl: true,
        id: true,
        logoUrl: true,
        slug: true,
        title: true,
        visibility: true
      },
      where: { id: input.entityId }
    });

    if (!entity || entity.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const { cost, durationMs } = resolveSpotlightSpend("entity_spotlight", input.credits);
    const endsAt = new Date(Date.now() + durationMs);
    const sponsor = await this.requireUserDisplayName(userId);
    const [reviews, ratingAggregate] = await Promise.all([
      this.prismaService.review.findMany({
        select: {
          authorId: true,
          entityId: true,
          id: true,
          locale: true,
          text: true
        },
        where: {
          authorId: userId,
          entityId: entity.id,
          visibility: "ACTIVE"
        }
      }),
      this.prismaService.ratingAggregate.findUnique({
        select: { avgScore: true, entityId: true, votesCount: true },
        where: { entityId: entity.id }
      })
    ]);
    const pitchLocale = resolveRecommendationLocale({
      localeInput: input.locale,
      message: input.message
    });
    const pitch = resolveEntityRecommendationPitch({
      entityId: entity.id,
      locale: pitchLocale,
      message: input.message ?? null,
      reviews: reviews as AuthorReviewRow[],
      userId
    });
    const recommendationLocale = pitch.review
      ? ((reviews as AuthorReviewRow[]).find((review) => review.id === pitch.review?.id)?.locale as
          | "ru"
          | "en"
          | undefined) ?? pitchLocale
      : resolveRecommendationLocale({
          localeInput: input.locale,
          message: pitch.message
        });

    const { balance, placement } = await this.prismaService.$transaction(async (transaction) => {
      await this.assertWithinActivePlacementLimit(userId, transaction);
      const nextBalance = await this.spotlightCreditsService.spend(
        userId,
        cost,
        "spend_entity",
        undefined,
        transaction
      );
      const recommendation = await transaction.communityRecommendation.create({
        data: {
          authorId: userId,
          entityId: entity.id,
          locale: recommendationLocale,
          message: pitch.message,
          placementType: "entity_spotlight",
          reviewId: pitch.review?.id ?? null
        }
      });
      const createdPlacement = await transaction.spotlightPlacement.create({
        data: {
          cost,
          endsAt,
          entityId: entity.id,
          placementType: "entity_spotlight",
          recommendationId: recommendation.id,
          userId
        }
      });

      return {
        balance: nextBalance,
        placement: createdPlacement
      };
    });

    const basePlacement = this.toPlacementDto(
      { ...placement, sponsorDisplayName: sponsor },
      new Map([[entity.id, entity]]),
      new Map()
    );

    return {
      balance,
      placement: attachRecommendationToPlacement(basePlacement, {
        cost,
        entityRating: ratingAggregate
          ? {
              avgScore: Number(ratingAggregate.avgScore),
              entityId: ratingAggregate.entityId,
              votesCount: ratingAggregate.votesCount
            }
          : null,
        locale: pitchLocale,
        message: pitch.message,
        review: pitch.review
      })
    };
  }

  async spendOnBattle(
    userId: string,
    input: CreateSpotlightBattleDto
  ): Promise<SpendSpotlightResponseDto> {
    const parsed = parseCompareSlug(input.pairSlug);

    if (!parsed) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Invalid battle pair slug",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const [left, right] = await Promise.all([
      this.prismaService.entity.findUnique({
        select: { id: true, slug: true, title: true, visibility: true },
        where: { slug: parsed.leftSlug }
      }),
      this.prismaService.entity.findUnique({
        select: { id: true, slug: true, title: true, visibility: true },
        where: { slug: parsed.rightSlug }
      })
    ]);

    if (!left || !right || left.visibility !== "ACTIVE" || right.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Battle pair not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const pairKey = buildPairKey(left.id, right.id);
    const pairSlug = `${left.slug}-vs-${right.slug}`;
    const { cost, durationMs } = resolveSpotlightSpend("battle_boost", input.credits);
    const endsAt = new Date(Date.now() + durationMs);
    const sponsor = await this.requireUserDisplayName(userId);
    const recommendationLocale = resolveRecommendationLocale({
      localeInput: input.locale
    });

    const { balance, placement } = await this.prismaService.$transaction(async (transaction) => {
      await this.assertWithinActivePlacementLimit(userId, transaction);
      const nextBalance = await this.spotlightCreditsService.spend(
        userId,
        cost,
        "spend_battle",
        undefined,
        transaction
      );
      const recommendation = await transaction.communityRecommendation.create({
        data: {
          authorId: userId,
          locale: recommendationLocale,
          pairKey,
          pairSlug,
          placementType: "battle_boost"
        }
      });
      const createdPlacement = await transaction.spotlightPlacement.create({
        data: {
          cost,
          endsAt,
          pairKey,
          pairSlug,
          placementType: "battle_boost",
          recommendationId: recommendation.id,
          userId
        }
      });

      return {
        balance: nextBalance,
        placement: createdPlacement
      };
    });

    const basePlacement = {
      endsAt: placement.endsAt.toISOString(),
      href: `/compare/${pairSlug}`,
      pairSlug,
      placementId: placement.id,
      placementType: placement.placementType,
      sponsorDisplayName: sponsor,
      startsAt: placement.startsAt.toISOString(),
      title: `${left.title} vs ${right.title}`
    } satisfies SpotlightPlacementDto;

    return {
      balance,
      placement: {
        ...basePlacement,
        recommendation: buildRecommendationDto({
          authorDisplayName: sponsor,
          cost,
          endsAt: basePlacement.endsAt
        })
      }
    };
  }

  async spendOnTop(userId: string, input: CreateSpotlightTopDto): Promise<SpendSpotlightResponseDto> {
    const top = await this.prismaService.top.findUnique({
      select: { authorId: true, id: true, locale: true, slug: true, title: true, visibility: true },
      where: { id: input.topId }
    });

    if (!top || top.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Top not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (top.authorId !== userId) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "You can only highlight your own top",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const { cost, durationMs } = resolveSpotlightSpend("top_highlight", input.credits);
    const endsAt = new Date(Date.now() + durationMs);
    const sponsor = await this.requireUserDisplayName(userId);
    const recommendationLocale = resolveRecommendationLocale({
      localeInput: input.locale,
      topLocale: top.locale
    });

    const { balance, placement } = await this.prismaService.$transaction(async (transaction) => {
      await this.assertWithinActivePlacementLimit(userId, transaction);
      const nextBalance = await this.spotlightCreditsService.spend(
        userId,
        cost,
        "spend_top",
        undefined,
        transaction
      );
      const recommendation = await transaction.communityRecommendation.create({
        data: {
          authorId: userId,
          locale: recommendationLocale,
          placementType: "top_highlight",
          topId: top.id
        }
      });
      const createdPlacement = await transaction.spotlightPlacement.create({
        data: {
          cost,
          endsAt,
          placementType: "top_highlight",
          recommendationId: recommendation.id,
          topId: top.id,
          userId
        }
      });

      return {
        balance: nextBalance,
        placement: createdPlacement
      };
    });

    const basePlacement = this.toPlacementDto(
      { ...placement, sponsorDisplayName: sponsor },
      new Map(),
      new Map([[top.id, top]])
    );

    return {
      balance,
      placement: {
        ...basePlacement,
        recommendation: buildRecommendationDto({
          authorDisplayName: sponsor,
          cost,
          endsAt: basePlacement.endsAt
        })
      }
    };
  }

  private toEnrichedPlacementDto(
    placement: SpotlightPlacementRow,
    entitiesById: Map<string, SpotlightFeedEntity>,
    topsById: Map<string, { slug: string; title: string }>,
    context: {
      endorsementsCount: number;
      locale: SpotlightContentLocale;
      ratingsByEntityId: Map<string, EntityRatingRow>;
      reviewsByPair: Map<string, AuthorReviewRow[]>;
      storedMessage?: string | null;
      storedReview?: { id: string; text: string } | null;
      viewerCanEndorse?: boolean;
      viewerHasEndorsed?: boolean;
    }
  ): SpotlightPlacementDto {
    const basePlacement = this.toPlacementDto(placement, entitiesById, topsById);
    const review =
      context.storedReview ??
      (placement.placementType === "entity_spotlight" && placement.entityId
        ? pickAuthorReview(
            context.reviewsByPair.get(buildReviewPairKey(placement.userId, placement.entityId)) ?? [],
            placement.userId,
            placement.entityId,
            context.locale
          )
        : null);
    const message = context.storedMessage ?? null;

    return attachRecommendationToPlacement(basePlacement, {
      cost: placement.cost,
      endorsementsCount: context.endorsementsCount,
      entityRating:
        placement.entityId ? context.ratingsByEntityId.get(placement.entityId) ?? null : null,
      locale: context.locale,
      message,
      review,
      ...(context.viewerCanEndorse !== undefined
        ? { viewerCanEndorse: context.viewerCanEndorse }
        : {}),
      ...(context.viewerHasEndorsed !== undefined
        ? { viewerHasEndorsed: context.viewerHasEndorsed }
        : {})
    });
  }

  private toPlacementDto(
    placement: {
      endsAt: Date;
      entityId: string | null;
      id: string;
      pairSlug: string | null;
      placementType: "battle_boost" | "entity_spotlight" | "top_highlight";
      sponsorDisplayName: string;
      startsAt: Date;
      topId: string | null;
    },
    entitiesById: Map<string, SpotlightFeedEntity>,
    topsById: Map<string, { slug: string; title: string }>
  ): SpotlightPlacementDto {
    if (placement.placementType === "entity_spotlight" && placement.entityId) {
      const entity = entitiesById.get(placement.entityId);

      return {
        endsAt: placement.endsAt.toISOString(),
        entityCanonicalUrl: entity?.canonicalUrl ?? null,
        entityId: placement.entityId,
        entityLogoUrl: entity?.logoUrl ?? null,
        href: `/entities/${placement.entityId}`,
        placementId: placement.id,
        placementType: placement.placementType,
        sponsorDisplayName: placement.sponsorDisplayName,
        startsAt: placement.startsAt.toISOString(),
        title: entity?.title ?? placement.entityId
      };
    }

    if (placement.placementType === "top_highlight" && placement.topId) {
      const top = topsById.get(placement.topId);

      return {
        endsAt: placement.endsAt.toISOString(),
        href: `/tops/${top?.slug ?? placement.topId}`,
        placementId: placement.id,
        placementType: placement.placementType,
        sponsorDisplayName: placement.sponsorDisplayName,
        startsAt: placement.startsAt.toISOString(),
        title: top?.title ?? placement.topId
      };
    }

    return {
      endsAt: placement.endsAt.toISOString(),
      href: placement.pairSlug ? `/compare/${placement.pairSlug}` : "/battles",
      ...(placement.pairSlug ? { pairSlug: placement.pairSlug } : {}),
      placementId: placement.id,
      placementType: placement.placementType,
      sponsorDisplayName: placement.sponsorDisplayName,
      startsAt: placement.startsAt.toISOString(),
      title: placement.pairSlug?.replace(/-vs-/g, " vs ") ?? "Battle boost"
    };
  }

  private async assertWithinActivePlacementLimit(
    userId: string,
    transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]
  ): Promise<void> {
    const now = new Date();
    const activePlacements = await transaction.spotlightPlacement.count({
      where: {
        endsAt: { gt: now },
        startsAt: { lte: now },
        userId
      }
    });

    if (activePlacements >= SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: `You can have at most ${SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER} active spotlight placements`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
  }

  private async requireUserDisplayName(userId: string): Promise<string> {
    const user = await this.prismaService.user.findUnique({
      select: { displayName: true },
      where: { id: userId }
    });

    return user?.displayName ?? "Participant";
  }
}

function buildReviewPairKey(authorId: string, entityId: string): string {
  return `${authorId}:${entityId}`;
}

function groupReviewsByPair(reviews: AuthorReviewRow[]): Map<string, AuthorReviewRow[]> {
  const grouped = new Map<string, AuthorReviewRow[]>();

  for (const review of reviews) {
    const key = buildReviewPairKey(review.authorId, review.entityId);
    const existing = grouped.get(key) ?? [];
    existing.push(review);
    grouped.set(key, existing);
  }

  return grouped;
}
