import { Injectable } from "@nestjs/common";
import type { Rating } from "#prisma/client";

import { ReputationRepository } from "../repositories/reputation.repository.js";
import { ReputationService } from "./reputation.service.js";

export type ReputationBackfillResult = "processed" | "skipped";

@Injectable()
export class ReputationBackfillService {
  constructor(
    private readonly reputationRepository: ReputationRepository,
    private readonly reputationService: ReputationService
  ) {}

  async processRating(rating: Rating): Promise<ReputationBackfillResult> {
    const existingSnapshot = await this.reputationRepository.getVoteWeightSnapshotByRatingId(
      rating.id
    );

    if (existingSnapshot) {
      return "skipped";
    }

    await this.reputationService.onRatingCreated(
      {
        entityId: rating.entityId,
        ratingId: rating.id,
        score: rating.score,
        userId: rating.userId
      },
      rating.createdAt
    );

    return "processed";
  }
}
