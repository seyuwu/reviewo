import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";
import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import type { EntityCreatedPayload } from "../../entities/events/entity-created.event.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { RatingChangedPayload } from "../../ratings/events/rating-created.event.js";
import type { ReviewChangedPayload } from "../../reviews/events/review-created.event.js";
import { ActivityActionType } from "../constants/activity-action-type.js";
import type { BattleVoteCastPayload } from "../events/battle-vote-cast.event.js";
import type { ContributionApprovedPayload } from "../events/contribution-approved.event.js";
import type { DiscussionCreatedPayload } from "../events/discussion-created.event.js";
import type { TopChangedPayload } from "../events/top-changed.event.js";
import type { TopForkedPayload } from "../events/top-forked.event.js";
import type { TopLikedPayload } from "../events/top-liked.event.js";
import { ActivityEventsService } from "../services/activity-events.service.js";

@Injectable()
export class ActivityEventHandlers implements OnModuleInit {
  private readonly logger = new Logger(ActivityEventHandlers.name);

  constructor(
    private readonly activityEventsService: ActivityEventsService,
    private readonly domainEventBus: DomainEventBus,
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort
  ) {}

  onModuleInit(): void {
    this.domainEventBus.subscribe(DomainEventName.RatingCreated, (event) =>
      this.handleSafely(() =>
        this.handleRatingCreated(
          event as DomainEvent<DomainEventName.RatingCreated, RatingChangedPayload>
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
    this.domainEventBus.subscribe(DomainEventName.EntityCreated, (event) =>
      this.handleSafely(() =>
        this.handleEntityCreated(
          event as DomainEvent<DomainEventName.EntityCreated, EntityCreatedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.BattleVoteCast, (event) =>
      this.handleSafely(() =>
        this.handleBattleVote(
          event as DomainEvent<DomainEventName.BattleVoteCast, BattleVoteCastPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.TopCreated, (event) =>
      this.handleSafely(() =>
        this.handleTopCreated(event as DomainEvent<DomainEventName.TopCreated, TopChangedPayload>)
      )
    );
    this.domainEventBus.subscribe(DomainEventName.TopUpdated, (event) =>
      this.handleSafely(() =>
        this.handleTopUpdated(event as DomainEvent<DomainEventName.TopUpdated, TopChangedPayload>)
      )
    );
    this.domainEventBus.subscribe(DomainEventName.ContributionApproved, (event) =>
      this.handleSafely(() =>
        this.handleContributionApproved(
          event as DomainEvent<DomainEventName.ContributionApproved, ContributionApprovedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.DiscussionCreated, (event) =>
      this.handleSafely(() =>
        this.handleDiscussionCreated(
          event as DomainEvent<DomainEventName.DiscussionCreated, DiscussionCreatedPayload>
        )
      )
    );
    this.domainEventBus.subscribe(DomainEventName.TopLiked, (event) =>
      this.handleSafely(() =>
        this.handleTopLiked(event as DomainEvent<DomainEventName.TopLiked, TopLikedPayload>)
      )
    );
    this.domainEventBus.subscribe(DomainEventName.TopForked, (event) =>
      this.handleSafely(() =>
        this.handleTopForked(event as DomainEvent<DomainEventName.TopForked, TopForkedPayload>)
      )
    );
  }

  private async handleSafely(handler: () => Promise<void>): Promise<void> {
    try {
      await handler();
    } catch (error) {
      this.logger.error(
        "Activity event handler failed",
        error instanceof Error ? error.stack : error
      );
    }
  }

  private async handleRatingCreated(
    event: DomainEvent<DomainEventName.RatingCreated, RatingChangedPayload>
  ): Promise<void> {
    const entityType = await this.resolveEntityType(event.payload.entityId);

    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.RatingCreated,
      createdAt: event.occurredAt,
      entityId: event.payload.entityId,
      entityType,
      sourceId: event.payload.ratingId,
      userId: event.payload.userId
    });
  }

  private async handleReviewCreated(
    event: DomainEvent<DomainEventName.ReviewCreated, ReviewChangedPayload>
  ): Promise<void> {
    const entityType = await this.resolveEntityType(event.payload.entityId);

    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.ReviewCreated,
      createdAt: event.occurredAt,
      entityId: event.payload.entityId,
      entityType,
      sourceId: event.payload.reviewId,
      userId: event.payload.authorId
    });
  }

  private async handleEntityCreated(
    event: DomainEvent<DomainEventName.EntityCreated, EntityCreatedPayload>
  ): Promise<void> {
    if (!event.payload.createdBy) {
      return;
    }

    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.EntityCreated,
      createdAt: event.occurredAt,
      entityId: event.payload.entityId,
      entityType: event.payload.type,
      sourceId: event.payload.entityId,
      userId: event.payload.createdBy
    });
  }

  private async handleBattleVote(
    event: DomainEvent<DomainEventName.BattleVoteCast, BattleVoteCastPayload>
  ): Promise<void> {
    if (!event.payload.userId) {
      return;
    }

    const entityType = await this.resolveEntityType(event.payload.entityId);

    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.BattleVote,
      createdAt: event.occurredAt,
      entityId: event.payload.entityId,
      entityType,
      sourceId: event.payload.battleVoteId,
      userId: event.payload.userId
    });
  }

  private async handleTopCreated(
    event: DomainEvent<DomainEventName.TopCreated, TopChangedPayload>
  ): Promise<void> {
    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.TopCreated,
      categoryId: event.payload.categoryId,
      createdAt: event.occurredAt,
      sourceId: event.payload.topId,
      userId: event.payload.userId
    });
  }

  private async handleTopUpdated(
    event: DomainEvent<DomainEventName.TopUpdated, TopChangedPayload>
  ): Promise<void> {
    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.TopUpdated,
      categoryId: event.payload.categoryId,
      createdAt: event.occurredAt,
      sourceId: `${event.payload.topId}:${event.occurredAt.getTime()}`,
      userId: event.payload.userId
    });
  }

  private async handleContributionApproved(
    event: DomainEvent<DomainEventName.ContributionApproved, ContributionApprovedPayload>
  ): Promise<void> {
    const entityType = await this.resolveEntityType(event.payload.entityId);

    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.ContributionApproved,
      createdAt: event.occurredAt,
      entityId: event.payload.entityId,
      entityType,
      payload: {
        contributionType: event.payload.contributionType
      },
      sourceId: event.payload.contributionId,
      userId: event.payload.authorId
    });
  }

  private async handleDiscussionCreated(
    event: DomainEvent<DomainEventName.DiscussionCreated, DiscussionCreatedPayload>
  ): Promise<void> {
    const entityType = await this.resolveEntityType(event.payload.entityId);

    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.DiscussionCreated,
      createdAt: event.occurredAt,
      entityId: event.payload.entityId,
      entityType,
      sourceId: event.payload.messageId,
      userId: event.payload.userId
    });
  }

  private async handleTopLiked(
    event: DomainEvent<DomainEventName.TopLiked, TopLikedPayload>
  ): Promise<void> {
    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.TopLiked,
      categoryId: event.payload.categoryId,
      createdAt: event.occurredAt,
      sourceId: event.payload.likeId,
      targetUserId: event.payload.likedByUserId,
      userId: event.payload.topAuthorId
    });
  }

  private async handleTopForked(
    event: DomainEvent<DomainEventName.TopForked, TopForkedPayload>
  ): Promise<void> {
    await this.activityEventsService.recordActivity({
      actionType: ActivityActionType.TopForked,
      categoryId: event.payload.categoryId,
      createdAt: event.occurredAt,
      sourceId: event.payload.forkedTopId,
      targetUserId: event.payload.forkerUserId,
      userId: event.payload.sourceAuthorId
    });
  }

  private async resolveEntityType(entityId: string): Promise<string | null> {
    const entity = await this.entitiesPort.findEntityById(entityId);
    return entity?.type ?? null;
  }
}
