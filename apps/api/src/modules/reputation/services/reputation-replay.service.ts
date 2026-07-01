import { Injectable, Logger } from "@nestjs/common";
import type { ReputationEvent } from "#prisma/client";

import { ReputationRepository } from "../repositories/reputation.repository.js";
import { ReputationCalculationContext } from "./reputation-calculation-context.service.js";
import type { RatingChangedEventPayload } from "./reputation.service.js";
import { ReputationService } from "./reputation.service.js";

export interface ReputationReplayOptions {
  calculationVersion?: number;
}

@Injectable()
export class ReputationReplayService {
  private readonly logger = new Logger(ReputationReplayService.name);

  constructor(
    private readonly calculationContext: ReputationCalculationContext,
    private readonly reputationRepository: ReputationRepository,
    private readonly reputationService: ReputationService
  ) {}

  async replay(options: ReputationReplayOptions = {}): Promise<{ replayedEvents: number }> {
    if (options.calculationVersion !== undefined) {
      this.calculationContext.setVersion(options.calculationVersion);
    }

    await this.reputationRepository.clearDerivedState();

    const events = await this.reputationRepository.listReputationEventsOrdered();
    let replayedEvents = 0;

    for (const event of events) {
      await this.replayEvent(event);
      replayedEvents += 1;
    }

    this.logger.log(
      `Reputation replay completed: events=${replayedEvents}, version=${this.calculationContext.getVersion()}`
    );

    return {
      replayedEvents
    };
  }

  private async replayEvent(event: ReputationEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const occurredAt =
      typeof payload["occurredAt"] === "string" ? new Date(payload["occurredAt"]) : event.createdAt;

    switch (event.type) {
      case "rating.created":
        await this.reputationService.onRatingCreated(
          toRatingPayload(payload),
          occurredAt,
          { skipEventAppend: true }
        );
        return;
      case "rating.updated": {
        const previousScore =
          typeof payload["previousScore"] === "number"
            ? payload["previousScore"]
            : (await this.reputationRepository.getVoteWeightSnapshotByRatingId(
                String(payload["ratingId"])
              ))?.score;

        if (previousScore === undefined) {
          await this.reputationService.onRatingCreated(
            toRatingPayload(payload),
            occurredAt,
            { skipEventAppend: true }
          );
          return;
        }

        await this.reputationService.onRatingUpdated(
          toRatingPayload(payload),
          previousScore,
          occurredAt,
          { skipEventAppend: true }
        );
        return;
      }
      case "review.created":
        await this.reputationService.onReviewCreated(
          {
            authorId: String(payload["authorId"]),
            entityId: String(payload["entityId"]),
            reviewId: String(payload["reviewId"])
          },
          occurredAt,
          { skipEventAppend: true }
        );
        return;
      case "review.hidden":
        await this.reputationService.onReviewHidden(
          {
            authorId: String(payload["authorId"]),
            entityId: String(payload["entityId"]),
            reviewId: String(payload["reviewId"])
          },
          occurredAt,
          { skipEventAppend: true }
        );
        return;
      case "review.unhidden":
        await this.reputationService.onReviewUnhidden(
          {
            authorId: String(payload["authorId"]),
            entityId: String(payload["entityId"]),
            reviewId: String(payload["reviewId"])
          },
          occurredAt,
          { skipEventAppend: true }
        );
        return;
      default:
        return;
    }
  }
}

function toRatingPayload(payload: Record<string, unknown>): RatingChangedEventPayload {
  return {
    entityId: String(payload["entityId"]),
    ratingId: String(payload["ratingId"]),
    score: Number(payload["score"]),
    userId: String(payload["userId"])
  };
}
