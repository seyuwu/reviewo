import { Injectable } from "@nestjs/common";

import type { DomainEvent, DomainEventHandler } from "./domain-event.js";
import type { DomainEventName } from "./domain-event-name.js";

export type UnsubscribeDomainEventHandler = () => void;

@Injectable()
export class DomainEventBus {
  private readonly handlers = new Map<DomainEventName, Set<DomainEventHandler>>();

  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.name);

    if (!eventHandlers) {
      return;
    }

    for (const handler of eventHandlers) {
      await handler(event);
    }
  }

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent["name"],
    handler: DomainEventHandler<TEvent>
  ): UnsubscribeDomainEventHandler {
    const eventHandlers = this.handlers.get(eventName) ?? new Set<DomainEventHandler>();

    eventHandlers.add(handler as DomainEventHandler);
    this.handlers.set(eventName, eventHandlers);

    return () => {
      eventHandlers.delete(handler as DomainEventHandler);
    };
  }
}
