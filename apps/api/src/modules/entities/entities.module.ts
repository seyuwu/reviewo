import { Module } from "@nestjs/common";

import { DomainEventsModule } from "../../common/domain-events/domain-events.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { UsersModule } from "../users/users.module.js";
import { EntitiesController } from "./controllers/entities.controller.js";
import { TrustCheckController } from "./controllers/trust-check.controller.js";
import { EntityMediaCreatedHandler } from "./handlers/entity-media-created.handler.js";
import { ENTITIES_PORT } from "./interfaces/entities.port.js";
import { URL_NORMALIZER } from "./interfaces/url-normalizer.js";
import { EntitiesRepository } from "./repositories/entities.repository.js";
import { EntityClusterRepository } from "./repositories/entity-cluster.repository.js";
import { EntityMediaBackfillRepository } from "./repositories/entity-media-backfill.repository.js";
import { EntityMediaRepository } from "./repositories/entity-media.repository.js";
import { EntitiesService } from "./services/entities.service.js";
import { EntityClusterService } from "./services/entity-cluster.service.js";
import { EntityMediaBackfillService } from "./services/entity-media-backfill.service.js";
import { EntityMediaEnrichmentService } from "./services/entity-media-enrichment.service.js";
import { EntityMediaService } from "./services/entity-media.service.js";
import { SiteMetadataFetcherService } from "./services/site-metadata-fetcher.service.js";
import { UrlNormalizationService } from "./services/url-normalization.service.js";

@Module({
  controllers: [EntitiesController, TrustCheckController],
  exports: [
    ENTITIES_PORT,
    EntitiesService,
    EntityClusterService,
    EntityMediaEnrichmentService,
    EntityMediaService,
    EntityMediaBackfillService,
    URL_NORMALIZER
  ],
  imports: [AuthModule, DomainEventsModule, UsersModule],
  providers: [
    EntitiesRepository,
    EntityClusterRepository,
    EntityMediaBackfillRepository,
    EntityMediaBackfillService,
    EntityMediaRepository,
    EntitiesService,
    EntityClusterService,
    EntityMediaService,
    EntityMediaEnrichmentService,
    SiteMetadataFetcherService,
    EntityMediaCreatedHandler,
    UrlNormalizationService,
    {
      provide: ENTITIES_PORT,
      useExisting: EntitiesService
    },
    {
      provide: URL_NORMALIZER,
      useExisting: UrlNormalizationService
    }
  ]
})
export class EntitiesModule {}
