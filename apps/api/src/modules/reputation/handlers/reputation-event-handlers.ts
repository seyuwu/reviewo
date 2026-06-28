import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";
import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import type { ApplicationConfig } from "../../../config/environment.config.js";
import type { RatingChangedPayload } from "../../ratings/events/rating-created.event.js";
import type { ReviewChangedPayload } from "../../reviews/events/review-created.event.js";
import { ReputationRepository } from "../repositories/reputation.repository.js";
import { ReputationService } from "../services/reputation.service.js";

@Injectable()
export class ReputationEventHandlers implements OnModuleInit {
  private readonly logger = new Logger(ReputationEventHandlers.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly domainEventBus: DomainEventBus,
    private readonly reputationRepository: ReputationRepository,
    private readonly reputationService: ReputationService
  ) {}

  onModuleInit(): void {
    this.domainEventBus.subscribe(DomainEventName.RatingCreated, (event) =>
      this.handleSafely(() =>
        this.handleRatingCreated(
          event as DomainEvent<DomainEventName.RatingCreated, RatingChangedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.RatingUpdated, (event) =>
      this.handleSafely(() =>
        this.handleRatingUpdated(
          event as DomainEvent<DomainEventName.RatingUpdated, RatingChangedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.ReviewCreated, (event) =>
      this.handleSafely(() =>
        this.handleReviewCreated(
          event as DomainEvent<DomainEventName.ReviewCreated, ReviewChangedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.ReviewHidden, (event) =>
      this.handleSafely(() =>
        this.handleReviewHidden(
          event as DomainEvent<DomainEventName.ReviewHidden, ReviewChangedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.ReviewUnhidden, (event) =>
      this.handleSafely(() =>
        this.handleReviewUnhidden(
          event as DomainEvent<DomainEventName.ReviewUnhidden, ReviewChangedPayload>
        )
      )
    );
  }

  private isEnabled(): boolean {
    return this.configService.get<ApplicationConfig>("app")?.reputationEngineEnabled === true;
  }

  private async handleSafely(handler: () => Promise<void>): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      await handler();
    } catch (error) {
      this.logger.error("Reputation event handler failed", error instanceof Error ? error.stack : error);
    }
  }

  private async handleRatingCreated(
    event: DomainEvent<DomainEventName.RatingCreated, RatingChangedPayload>
  ): Promise<void> {
    await this.reputationService.onRatingCreated(event.payload, event.occurredAt);
  }

  private async handleRatingUpdated(
    event: DomainEvent<DomainEventName.RatingUpdated, RatingChangedPayload>
  ): Promise<void> {
    const existingSnapshot = await this.reputationRepository.getVoteWeightSnapshotByRatingId(
      event.payload.ratingId
    );

    if (!existingSnapshot) {
      await this.reputationService.onRatingCreated(event.payload, event.occurredAt);
      return;
    }

    await this.reputationService.onRatingUpdated(
      event.payload,
      existingSnapshot.score,
      event.occurredAt
    );
  }

  private async handleReviewCreated(
    event: DomainEvent<DomainEventName.ReviewCreated, ReviewChangedPayload>
  ): Promise<void> {
    await this.reputationService.onReviewCreated(event.payload, event.occurredAt);
  }

  private async handleReviewHidden(
    event: DomainEvent<DomainEventName.ReviewHidden, ReviewChangedPayload>
  ): Promise<void> {
    await this.reputationService.onReviewHidden(event.payload, event.occurredAt);
  }

  private async handleReviewUnhidden(
    event: DomainEvent<DomainEventName.ReviewUnhidden, ReviewChangedPayload>
  ): Promise<void> {
    await this.reputationService.onReviewUnhidden(event.payload, event.occurredAt);
  }
}
