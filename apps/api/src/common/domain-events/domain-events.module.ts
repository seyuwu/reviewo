import { Module } from "@nestjs/common";

import { DomainEventBus } from "./domain-event-bus.js";

@Module({
  exports: [DomainEventBus],
  providers: [DomainEventBus]
})
export class DomainEventsModule {}
