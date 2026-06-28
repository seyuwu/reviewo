import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { ReputationReadRepository } from "../repositories/reputation-read.repository.js";
import { ReputationRepository } from "../repositories/reputation.repository.js";
import type { ConfidenceReason } from "../types/confidence-reason.types.js";
import { differenceInDays } from "../utils/date-buckets.js";
import { calculateVariance } from "../utils/reputation-math.js";
import { extractRootDomain } from "../utils/root-domain.js";
import { ReputationCalculationContext } from "./reputation-calculation-context.service.js";
import { AnomalyDetectionService } from "./anomaly-detection.service.js";
import { EntityConfidenceCalculator } from "./entity-confidence-calculator.service.js";
import { UserTrustCalculator } from "./user-trust-calculator.service.js";
import { VoteWeightCalculator } from "./vote-weight-calculator.service.js";
import type { EntityAnalyticsDto } from "../dto/entity-analytics.dto.js";
import type { EntityConfidenceDto } from "../dto/entity-analytics.dto.js";
import type { EntityConfidenceExplanationDto } from "../dto/entity-confidence-explanation.dto.js";
import type { UserTrustProfileDto } from "../dto/user-trust-profile.dto.js";

const ACTIVITY_LOOKBACK_DAYS = 90;
const SYNC_WINDOW_MINUTES = 5;

export interface RatingChangedEventPayload {
  entityId: string;
  ratingId: string;
  score: number;
  userId: string;
}

export interface ReviewVisibilityChangedPayload {
  authorId: string;
  entityId: string;
  reviewId: string;
}

export interface ReputationProcessingOptions {
  skipEventAppend?: boolean;
}

@Injectable()
export class ReputationService {
  constructor(
    private readonly anomalyDetectionService: AnomalyDetectionService,
    private readonly calculationContext: ReputationCalculationContext,
    private readonly entityConfidenceCalculator: EntityConfidenceCalculator,
    private readonly readRepository: ReputationReadRepository,
    private readonly reputationRepository: ReputationRepository,
    private readonly userTrustCalculator: UserTrustCalculator,
    private readonly voteWeightCalculator: VoteWeightCalculator
  ) {}

  async onRatingCreated(
    payload: RatingChangedEventPayload,
    occurredAt = new Date(),
    options: ReputationProcessingOptions = {}
  ): Promise<void> {
    if (!options.skipEventAppend) {
      await this.appendEvent("rating.created", payload, occurredAt);
    }
    await this.processRatingChange({
      entityId: payload.entityId,
      isScoreUpdate: false,
      occurredAt,
      ratingId: payload.ratingId,
      score: payload.score,
      userId: payload.userId
    });
  }

  async onRatingUpdated(
    payload: RatingChangedEventPayload,
    previousScore: number,
    occurredAt = new Date(),
    options: ReputationProcessingOptions = {}
  ): Promise<void> {
    if (!options.skipEventAppend) {
      await this.appendEvent("rating.updated", { ...payload, previousScore }, occurredAt);
    }
    await this.reputationRepository.updateRatingScoreInBehaviorMetrics(
      payload.userId,
      previousScore,
      payload.score
    );
    await this.processRatingChange({
      entityId: payload.entityId,
      isScoreUpdate: true,
      occurredAt,
      ratingId: payload.ratingId,
      score: payload.score,
      userId: payload.userId
    });
  }

  async onReviewCreated(
    payload: ReviewVisibilityChangedPayload,
    occurredAt = new Date(),
    options: ReputationProcessingOptions = {}
  ): Promise<void> {
    if (!options.skipEventAppend) {
      await this.appendEvent("review.created", payload, occurredAt);
    }
  }

  async onReviewHidden(
    payload: ReviewVisibilityChangedPayload,
    occurredAt = new Date(),
    options: ReputationProcessingOptions = {}
  ): Promise<void> {
    if (!options.skipEventAppend) {
      await this.appendEvent("review.hidden", payload, occurredAt);
    }
  }

  async onReviewUnhidden(
    payload: ReviewVisibilityChangedPayload,
    occurredAt = new Date(),
    options: ReputationProcessingOptions = {}
  ): Promise<void> {
    if (!options.skipEventAppend) {
      await this.appendEvent("review.unhidden", payload, occurredAt);
    }
  }

  async getUserTrustProfile(userId: string): Promise<UserTrustProfileDto> {
    const profile = await this.reputationRepository.getUserTrustProfile(userId);

    if (!profile) {
      throw createProfileNotFoundException("User trust profile was not found");
    }

    const behaviorMetrics = await this.reputationRepository.getUserBehaviorMetrics(userId);

    return {
      calculatedAt: profile.calculatedAt.toISOString(),
      calculationVersion: profile.calculationVersion,
      components: {
        accountAgeBonus: Number(profile.accountAgeBonus),
        anomalyPenalty: Number(profile.anomalyPenalty),
        consensus: Number(profile.consensusScore),
        coverage: Number(profile.coverageScore),
        diversity: Number(profile.diversityScore),
        stability: Number(profile.stabilityScore)
      },
      behaviorSummary: {
        firstRatingAt: behaviorMetrics?.firstRatingAt?.toISOString() ?? null,
        lastRatingAt: behaviorMetrics?.lastRatingAt?.toISOString() ?? null,
        totalRatings: behaviorMetrics?.totalRatings ?? 0,
        uniqueEntities: behaviorMetrics?.uniqueEntityCount ?? 0,
        uniqueRootDomains: behaviorMetrics?.uniqueRootDomainCount ?? 0
      },
      trustScore: Number(profile.trustScore),
      userId: profile.userId
    };
  }

  async getEntityAnalytics(entityId: string): Promise<EntityAnalyticsDto> {
    await this.ensureEntityExists(entityId);

    const [ratingAggregate, confidenceProfile, anomalyMetrics] = await Promise.all([
      this.readRepository.getRatingAggregate(entityId),
      this.reputationRepository.getEntityConfidenceProfile(entityId),
      this.reputationRepository.getEntityAnomalyMetrics(entityId)
    ]);

    return {
      anomaly: {
        burstScore: Number(anomalyMetrics?.burstScore ?? 0),
        clusterScore: Number(anomalyMetrics?.clusterScore ?? 0),
        score: Number(anomalyMetrics?.anomalyScore ?? 0),
        syncScore: Number(anomalyMetrics?.syncScore ?? 0)
      },
      confidence: confidenceProfile
        ? {
            activityDurationDays: confidenceProfile.activityDurationDays,
            score: Number(confidenceProfile.confidenceScore),
            uniqueRaters: confidenceProfile.uniqueRatersCount
          }
        : null,
      entityId,
      rating: {
        avgScore: ratingAggregate?.avgScore ?? 0,
        votesCount: ratingAggregate?.votesCount ?? 0
      }
    };
  }

  async getEntityConfidence(entityId: string): Promise<EntityConfidenceDto> {
    await this.ensureEntityExists(entityId);

    const [ratingAggregate, confidenceProfile] = await Promise.all([
      this.readRepository.getRatingAggregate(entityId),
      this.reputationRepository.getEntityConfidenceProfile(entityId)
    ]);

    return {
      confidence: confidenceProfile
        ? {
            activityDurationDays: confidenceProfile.activityDurationDays,
            score: Number(confidenceProfile.confidenceScore),
            uniqueRaters: confidenceProfile.uniqueRatersCount
          }
        : null,
      entityId,
      rating: {
        avgScore: ratingAggregate?.avgScore ?? 0,
        votesCount: ratingAggregate?.votesCount ?? 0
      }
    };
  }

  async getEntityConfidenceExplanation(entityId: string): Promise<EntityConfidenceExplanationDto> {
    await this.ensureEntityExists(entityId);

    const confidenceProfile = await this.reputationRepository.getEntityConfidenceProfile(entityId);

    if (!confidenceProfile) {
      throw createProfileNotFoundException("Entity confidence profile was not found");
    }

    return {
      confidence: Number(confidenceProfile.confidenceScore),
      entityId,
      reasons: confidenceProfile.explanation as unknown as ConfidenceReason[]
    };
  }

  private async processRatingChange(input: {
    entityId: string;
    isScoreUpdate: boolean;
    occurredAt: Date;
    ratingId: string;
    score: number;
    userId: string;
  }): Promise<void> {
    const entity = await this.readRepository.findEntityById(input.entityId);

    if (!entity) {
      return;
    }

    const parentContextType = await this.reputationRepository.resolveParentContextType(
      entity.parentId
    );
    const rootDomain = extractRootDomain(entity.canonicalUrl);

    if (!input.isScoreUpdate) {
      const entityStats = await this.reputationRepository.incrementUserEntityStats(
        input.userId,
        input.entityId,
        input.occurredAt
      );
      const typeStats = await this.reputationRepository.incrementUserEntityTypeStats(
        input.userId,
        entity.type,
        parentContextType
      );
      const domainStats = rootDomain
        ? await this.reputationRepository.incrementUserRootDomainStats(
            input.userId,
            rootDomain
          )
        : { isNewDomain: false };

      await this.reputationRepository.incrementUserActivityDaily(input.userId, input.occurredAt);
      await this.reputationRepository.applyRatingToUserBehaviorMetrics({
        isNewDomain: domainStats.isNewDomain,
        isNewEntity: entityStats.isNewEntity,
        isNewTypePair: typeStats.isNewPair,
        ratedAt: input.occurredAt,
        score: input.score,
        userId: input.userId
      });
    }

    const userTrust = await this.recalculateUserTrust(input.userId);
    const voteWeight = this.voteWeightCalculator.calculate({
      entityId: input.entityId,
      userId: input.userId,
      userTrust: userTrust.trustScore
    });

    await this.reputationRepository.upsertVoteWeightSnapshot({
      calculationVersion: this.calculationContext.getVersion(),
      entityId: input.entityId,
      ratingId: input.ratingId,
      score: input.score,
      userId: input.userId,
      voteWeight: voteWeight.weight,
      weightFactors: voteWeight.factors as Prisma.InputJsonValue
    });

    const ratingsLastHour = await this.reputationRepository.incrementEntityActivityHourly(
      input.entityId,
      input.occurredAt
    );
    await this.recalculateEntityMetrics(input.entityId, ratingsLastHour);
  }

  private async recalculateUserTrust(userId: string) {
    const user = await this.readRepository.findUserById(userId);
    const behaviorMetrics = await this.reputationRepository.getUserBehaviorMetrics(userId);
    const since = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 86_400_000);

    const [dailyRatingCounts, entityRatingCounts, uniqueTypeParentPairCount] = await Promise.all([
      this.reputationRepository.listUserActivityDaily(userId, since),
      this.reputationRepository.listTopUserEntityRatingCounts(userId),
      this.reputationRepository.countUserEntityTypePairs(userId)
    ]);

    const trustResult = this.userTrustCalculator.calculate({
      accountCreatedAt: user?.createdAt ?? new Date(),
      anomalyPenalty: 0,
      dailyRatingCounts,
      entityRatingCounts,
      scoreCounts: behaviorMetrics
        ? [
            behaviorMetrics.score1Count,
            behaviorMetrics.score2Count,
            behaviorMetrics.score3Count,
            behaviorMetrics.score4Count,
            behaviorMetrics.score5Count
          ]
        : [0, 0, 0, 0, 0],
      totalRatings: behaviorMetrics?.totalRatings ?? 0,
      uniqueEntityTypeCount: behaviorMetrics?.uniqueEntityTypeCount ?? 0,
      uniqueRootDomainCount: behaviorMetrics?.uniqueRootDomainCount ?? 0,
      uniqueTypeParentPairCount
    });

    await this.reputationRepository.upsertUserTrustProfile({
      accountAgeBonus: trustResult.accountAgeBonus,
      anomalyPenalty: 0,
      calculationVersion: this.calculationContext.getVersion(),
      consensusScore: trustResult.consensusScore,
      coverageScore: trustResult.coverageScore,
      diversityScore: trustResult.diversityScore,
      stabilityScore: trustResult.stabilityScore,
      trustScore: trustResult.trustScore,
      userId
    });

    return trustResult;
  }

  private async recalculateEntityMetrics(entityId: string, ratingsLastHour: number): Promise<void> {
    const ratingStats = await this.readRepository.getEntityRatingStats(entityId);
    const syncWindowStart = new Date(Date.now() - SYNC_WINDOW_MINUTES * 60_000);
    const syncClusterCount = await this.readRepository.countDistinctRatersInWindow(
      entityId,
      syncWindowStart
    );
    const existingAnomaly = await this.reputationRepository.getEntityAnomalyMetrics(entityId);
    const anomalyResult = this.anomalyDetectionService.detect({
      clusterScore: Number(existingAnomaly?.clusterScore ?? 0),
      ratingsLastHour,
      syncClusterCount: syncClusterCount >= 3 ? 1 : 0
    });

    await this.reputationRepository.upsertEntityAnomalyMetrics({
      anomalyScore: anomalyResult.anomalyScore,
      burstScore: anomalyResult.burstScore,
      clusterScore: anomalyResult.clusterScore,
      entityId,
      recentBurstCount: anomalyResult.recentBurstCount,
      syncScore: anomalyResult.syncScore
    });

    const effectiveVoteMass = await this.reputationRepository.sumVoteWeightsForEntity(entityId);
    const confidenceResult = this.entityConfidenceCalculator.calculate({
      activityDurationDays:
        ratingStats.firstRatingAt && ratingStats.lastRatingAt
          ? differenceInDays(ratingStats.firstRatingAt, ratingStats.lastRatingAt)
          : 0,
      anomalyScore: anomalyResult.anomalyScore,
      effectiveVoteMass,
      scoreVariance: calculateVariance(ratingStats.scores),
      uniqueRatersCount: ratingStats.uniqueRatersCount
    });

    await this.reputationRepository.upsertEntityConfidenceProfile({
      activityDurationDays:
        ratingStats.firstRatingAt && ratingStats.lastRatingAt
          ? differenceInDays(ratingStats.firstRatingAt, ratingStats.lastRatingAt)
          : 0,
      anomalyScore: anomalyResult.anomalyScore,
      calculationVersion: this.calculationContext.getVersion(),
      confidenceScore: confidenceResult.confidenceScore,
      effectiveVoteMass,
      entityId,
      explanation: confidenceResult.explanation as unknown as Prisma.InputJsonValue,
      scoreVariance:
        ratingStats.scores.length > 0 ? calculateVariance(ratingStats.scores) : null,
      uniqueRatersCount: ratingStats.uniqueRatersCount
    });
  }

  private async appendEvent(
    type: string,
    payload: RatingChangedEventPayload | ReviewVisibilityChangedPayload | Record<string, unknown>,
    occurredAt: Date
  ): Promise<void> {
    const payloadRecord = payload as Record<string, unknown>;

    await this.reputationRepository.appendReputationEvent({
      ...(typeof payloadRecord["entityId"] === "string"
        ? { entityId: payloadRecord["entityId"] }
        : {}),
      payload: {
        ...payloadRecord,
        occurredAt: occurredAt.toISOString()
      },
      ...(typeof payloadRecord["ratingId"] === "string"
        ? { ratingId: payloadRecord["ratingId"] }
        : {}),
      type,
      ...(typeof payloadRecord["userId"] === "string"
        ? { userId: payloadRecord["userId"] }
        : typeof payloadRecord["authorId"] === "string"
          ? { userId: payloadRecord["authorId"] }
          : {})
    });
  }

  private async ensureEntityExists(entityId: string): Promise<void> {
    const entity = await this.readRepository.findEntityById(entityId);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
  }
}

function createProfileNotFoundException(message: string): Error {
  return createAppException({
    code: AppErrorCode.NotFound,
    message,
    statusCode: HttpStatus.NOT_FOUND
  });
}
