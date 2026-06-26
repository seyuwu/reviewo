import type { DomainEventName } from "./domain-event-name.js";

export interface DomainEvent<TName extends DomainEventName = DomainEventName, TPayload = unknown> {
  name: TName;
  occurredAt: Date;
  payload: TPayload;
}

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent
) => Promise<void> | void;
