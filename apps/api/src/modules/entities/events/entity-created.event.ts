import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface EntityCreatedPayload {
  createdBy: string | null;
  entityId: string;
  type: string;
}

export type EntityCreatedEvent = DomainEvent<DomainEventName.EntityCreated, EntityCreatedPayload>;

export function createEntityCreatedEvent(payload: EntityCreatedPayload): EntityCreatedEvent {
  return {
    name: DomainEventName.EntityCreated,
    occurredAt: new Date(),
    payload
  };
}
