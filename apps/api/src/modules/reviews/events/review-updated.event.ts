import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

import type { ReviewChangedPayload } from "./review-created.event.js";

export type ReviewUpdatedEvent = DomainEvent<DomainEventName.ReviewUpdated, ReviewChangedPayload>;

export function createReviewUpdatedEvent(payload: ReviewChangedPayload): ReviewUpdatedEvent {
  return {
    name: DomainEventName.ReviewUpdated,
    occurredAt: new Date(),
    payload
  };
}
