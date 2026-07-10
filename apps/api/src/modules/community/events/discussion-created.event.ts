import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface DiscussionCreatedPayload {
  entityId: string;
  messageId: string;
  userId: string;
}

export type DiscussionCreatedEvent = DomainEvent<
  DomainEventName.DiscussionCreated,
  DiscussionCreatedPayload
>;

export function createDiscussionCreatedEvent(
  payload: DiscussionCreatedPayload
): DiscussionCreatedEvent {
  return {
    name: DomainEventName.DiscussionCreated,
    occurredAt: new Date(),
    payload
  };
}
