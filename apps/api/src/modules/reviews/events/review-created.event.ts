import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface ReviewChangedPayload {
  authorId: string;
  entityId: string;
  reviewId: string;
}

export type ReviewCreatedEvent = DomainEvent<DomainEventName.ReviewCreated, ReviewChangedPayload>;

export function createReviewCreatedEvent(payload: ReviewChangedPayload): ReviewCreatedEvent {
  return {
    name: DomainEventName.ReviewCreated,
    occurredAt: new Date(),
    payload
  };
}
