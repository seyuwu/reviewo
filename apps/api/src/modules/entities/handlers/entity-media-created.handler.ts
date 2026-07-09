import { Injectable, OnModuleInit } from "@nestjs/common";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";
import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import type { EntityCreatedPayload } from "../events/entity-created.event.js";
import { EntityMediaEnrichmentService } from "../services/entity-media-enrichment.service.js";

@Injectable()
export class EntityMediaCreatedHandler implements OnModuleInit {
  constructor(
    private readonly domainEventBus: DomainEventBus,
    private readonly entityMediaEnrichmentService: EntityMediaEnrichmentService
  ) {}

  onModuleInit(): void {
    this.domainEventBus.subscribe(DomainEventName.EntityCreated, (event) => {
      const payload = (event as DomainEvent<DomainEventName.EntityCreated, EntityCreatedPayload>).payload;

      this.entityMediaEnrichmentService.scheduleEnrichment(payload.entityId);
    });
  }
}
