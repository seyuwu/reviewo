import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { buildPairKey, normalizeContentLocaleFilter, parseCompareSlug } from "@reviewo/shared";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";

import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { resolveVoterKey } from "../../../common/voter-key.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { ReputationDisplayService } from "../../reputation/services/reputation-display.service.js";
import { REVIEWS_PORT } from "../../reviews/interfaces/reviews.port.js";
import type { ReviewsPort } from "../../reviews/interfaces/reviews.port.js";
import type {
  GrowthBattleResponseDto,
  GrowthBattleSideDto,
  GrowthBattleVoteResponseDto,
  GrowthCompareResponseDto,
  GrowthCompareSideDto
} from "../dto/growth.dto.js";
import { BattleVoteRepository } from "../repositories/battle-vote.repository.js";
import { resolveBattleLocale } from "../lib/resolve-battle-locale.js";
import { createBattleVoteRateLimitRules } from "../rate-limiting/battle-rate-limit-rules.js";
import { createBattleVoteCastEvent } from "../../community/events/battle-vote-cast.event.js";

@Injectable()
export class GrowthCompareService {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    @Inject(REVIEWS_PORT)
    private readonly reviewsPort: ReviewsPort,
    private readonly reputationDisplayService: ReputationDisplayService,
    private readonly battleVoteRepository: BattleVoteRepository,
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly domainEventBus: DomainEventBus
  ) {}

  async getCompare(pairSlug: string): Promise<GrowthCompareResponseDto> {
    const resolved = await this.resolvePairEntities(pairSlug);

    return {
      left: await this.composeSide(resolved.left),
      pairSlug: resolved.normalizedPairSlug,
      right: await this.composeSide(resolved.right)
    };
  }

  async getCompareByEntityIds(
    leftEntityId: string,
    rightEntityId: string
  ): Promise<GrowthCompareResponseDto> {
    const [left, right] = await Promise.all([
      this.entitiesPort.findEntityById(leftEntityId.trim()),
      this.entitiesPort.findEntityById(rightEntityId.trim())
    ]);

    if (!left || !right || left.id === right.id) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Compare pair was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return {
      left: await this.composeSide(left),
      pairSlug: `${left.slug}-vs-${right.slug}`,
      right: await this.composeSide(right)
    };
  }

  async getBattle(
    pairSlug: string,
    voterHeader?: string,
    request?: RequestLike,
    localeInput?: string
  ): Promise<GrowthBattleResponseDto> {
    const resolved = await this.resolvePairEntities(pairSlug);
    const pairKey = buildPairKey(resolved.left.id, resolved.right.id);
    const voterKey = resolveVoterKey(voterHeader, request);
    const localeFilter = normalizeContentLocaleFilter(localeInput);
    const voteLocale = localeFilter === "all" ? null : localeFilter;
    const existingVote = voteLocale
      ? await this.battleVoteRepository.findVote(pairKey, voterKey, voteLocale)
      : null;
    const voteCounts = await this.battleVoteRepository.countVotesByEntity(pairKey, localeFilter);
    const leftCount = voteCounts.get(resolved.left.id) ?? 0;
    const rightCount = voteCounts.get(resolved.right.id) ?? 0;
    const totalVotes = leftCount + rightCount;

    const [leftSide, rightSide] = await Promise.all([
      this.composeBattleSide(resolved.left, leftCount, totalVotes),
      this.composeBattleSide(resolved.right, rightCount, totalVotes)
    ]);

    return {
      hasVoted: Boolean(existingVote),
      left: leftSide,
      pairSlug: resolved.normalizedPairSlug,
      right: rightSide,
      totalVotes,
      votedEntityId: existingVote?.entityId ?? null
    };
  }

  async submitBattleVote(
    pairSlug: string,
    entityId: string,
    voterHeader: string | undefined,
    request: RequestLike,
    userId?: string,
    localeInput?: string
  ): Promise<GrowthBattleVoteResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(createBattleVoteRateLimitRules(request));

    const resolved = await this.resolvePairEntities(pairSlug);
    const pairKey = buildPairKey(resolved.left.id, resolved.right.id);
    const locale = resolveBattleLocale(localeInput);

    if (entityId !== resolved.left.id && entityId !== resolved.right.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Vote must target one of the compared entities",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const voterKey = resolveVoterKey(voterHeader, request);
    const existingVote = await this.battleVoteRepository.findVote(pairKey, voterKey, locale);
    let battleVoteId: string;

    if (existingVote) {
      if (existingVote.entityId === entityId) {
        return {
          battle: await this.getBattle(pairSlug, voterHeader, request, locale)
        };
      }

      const updatedVote = await this.battleVoteRepository.updateVote({
        entityId,
        locale,
        pairKey,
        ...(userId ? { userId } : {}),
        voterKey
      });
      battleVoteId = updatedVote.id;
    } else {
      const createdVote = await this.battleVoteRepository.createVote({
        entityId,
        locale,
        pairKey,
        ...(userId ? { userId } : {}),
        voterKey
      });
      battleVoteId = createdVote.id;
    }

    if (userId) {
      await this.domainEventBus.publish(
        createBattleVoteCastEvent({
          battleVoteId,
          entityId,
          pairKey,
          userId
        })
      );
    }

    return {
      battle: await this.getBattle(pairSlug, voterHeader, request, locale)
    };
  }

  private async resolvePairEntities(pairSlug: string): Promise<{
    left: EntityDto;
    normalizedPairSlug: string;
    right: EntityDto;
  }> {
    const parsed = parseCompareSlug(pairSlug);

    if (!parsed) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Compare pair was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const [left, right] = await Promise.all([
      this.entitiesPort.findEntityBySlug(parsed.leftSlug),
      this.entitiesPort.findEntityBySlug(parsed.rightSlug)
    ]);

    if (!left || !right || left.id === right.id) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Compare pair was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return {
      left,
      normalizedPairSlug: `${left.slug}-vs-${right.slug}`,
      right
    };
  }

  private async composeSide(entity: EntityDto): Promise<GrowthCompareSideDto> {
    const [rating, trust, reviewsCount] = await Promise.all([
      this.ratingsPort.getAggregate(entity.id),
      this.reputationDisplayService.resolveEntityTrustConfidence(entity.id),
      this.reviewsPort.getReviewCountForEntity(entity.id)
    ]);

    return {
      entity: {
        canonicalUrl: entity.canonicalUrl,
        description: entity.description,
        id: entity.id,
        slug: entity.slug,
        title: entity.title,
        type: entity.type
      },
      meta: {
        reviewsCount
      },
      rating: {
        avgScore: rating.avgScore,
        votesCount: rating.votesCount
      },
      trust: {
        confidence: trust.confidence
      }
    };
  }

  private async composeBattleSide(
    entity: EntityDto,
    voteCount: number,
    totalVotes: number
  ): Promise<GrowthBattleSideDto> {
    const side = await this.composeSide(entity);

    return {
      ...side,
      voteCount,
      votePercent: totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0
    };
  }
}
