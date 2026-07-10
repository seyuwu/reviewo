import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface TopChangedPayload {
  categoryId: string | null;
  topId: string;
  userId: string;
}

export type TopCreatedEvent = DomainEvent<DomainEventName.TopCreated, TopChangedPayload>;
export type TopUpdatedEvent = DomainEvent<DomainEventName.TopUpdated, TopChangedPayload>;

export function createTopCreatedEvent(payload: TopChangedPayload): TopCreatedEvent {
  return {
    name: DomainEventName.TopCreated,
    occurredAt: new Date(),
    payload
  };
}

export function createTopUpdatedEvent(payload: TopChangedPayload): TopUpdatedEvent {
  return {
    name: DomainEventName.TopUpdated,
    occurredAt: new Date(),
    payload
  };
}
