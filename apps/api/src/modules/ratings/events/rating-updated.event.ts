import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

import type { RatingChangedPayload } from "./rating-created.event.js";

export type RatingUpdatedEvent = DomainEvent<DomainEventName.RatingUpdated, RatingChangedPayload>;

export function createRatingUpdatedEvent(payload: RatingChangedPayload): RatingUpdatedEvent {
  return {
    name: DomainEventName.RatingUpdated,
    occurredAt: new Date(),
    payload
  };
}
