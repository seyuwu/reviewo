import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";
import type { ReviewChangedPayload } from "./review-created.event.js";

export type ReviewHiddenEvent = DomainEvent<DomainEventName.ReviewHidden, ReviewChangedPayload>;

export function createReviewHiddenEvent(payload: ReviewChangedPayload): ReviewHiddenEvent {
  return {
    name: DomainEventName.ReviewHidden,
    occurredAt: new Date(),
    payload
  };
}

export type ReviewUnhiddenEvent = DomainEvent<DomainEventName.ReviewUnhidden, ReviewChangedPayload>;

export function createReviewUnhiddenEvent(payload: ReviewChangedPayload): ReviewUnhiddenEvent {
  return {
    name: DomainEventName.ReviewUnhidden,
    occurredAt: new Date(),
    payload
  };
}
