import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface RatingChangedPayload {
  entityId: string;
  ratingId: string;
  score: number;
  userId: string;
}

export type RatingCreatedEvent = DomainEvent<DomainEventName.RatingCreated, RatingChangedPayload>;

export function createRatingCreatedEvent(payload: RatingChangedPayload): RatingCreatedEvent {
  return {
    name: DomainEventName.RatingCreated,
    occurredAt: new Date(),
    payload
  };
}
