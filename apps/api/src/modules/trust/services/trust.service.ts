import { Inject, Injectable } from "@nestjs/common";

import { resolveReliabilityLevel } from "@reviewo/shared";

import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { REVIEWS_PORT } from "../../reviews/interfaces/reviews.port.js";
import type { ReviewsPort } from "../../reviews/interfaces/reviews.port.js";
import type { TrustConfidenceDto } from "../dto/trust-confidence.dto.js";
import type { TrustPort } from "../interfaces/trust.port.js";
import { TrustConfidenceCalculatorService } from "./trust-confidence-calculator.service.js";

@Injectable()
export class TrustService implements TrustPort {
  constructor(
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    @Inject(REVIEWS_PORT)
    private readonly reviewsPort: ReviewsPort,
    private readonly confidenceCalculator: TrustConfidenceCalculatorService
  ) {}

  async getEntityTrust(entityId: string): Promise<TrustConfidenceDto> {
    const ratingAggregate = await this.ratingsPort.getAggregate(entityId);
    const reviewCount = await this.reviewsPort.getReviewCountForEntity(entityId);
    const confidence = this.confidenceCalculator.calculate({
      reviewCount,
      votesCount: ratingAggregate.votesCount
    });

    return {
      confidence,
      reliabilityLevel: resolveReliabilityLevel(confidence)
    };
  }
}
