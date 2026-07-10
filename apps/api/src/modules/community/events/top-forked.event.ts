import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface TopForkedPayload {
  categoryId: string | null;
  forkedTopId: string;
  forkerUserId: string;
  sourceAuthorId: string;
  sourceTopId: string;
}

export type TopForkedEvent = DomainEvent<DomainEventName.TopForked, TopForkedPayload>;

export function createTopForkedEvent(payload: TopForkedPayload): TopForkedEvent {
  return {
    name: DomainEventName.TopForked,
    occurredAt: new Date(),
    payload
  };
}
