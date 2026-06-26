import { Module } from "@nestjs/common";

import { DomainEventsModule } from "../../common/domain-events/domain-events.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { UsersModule } from "../users/users.module.js";
import { EntitiesController } from "./controllers/entities.controller.js";
import { ENTITIES_PORT } from "./interfaces/entities.port.js";
import { URL_NORMALIZER } from "./interfaces/url-normalizer.js";
import { EntitiesRepository } from "./repositories/entities.repository.js";
import { EntitiesService } from "./services/entities.service.js";
import { UrlNormalizationService } from "./services/url-normalization.service.js";

@Module({
  controllers: [EntitiesController],
  exports: [ENTITIES_PORT, EntitiesService],
  imports: [AuthModule, DomainEventsModule, UsersModule],
  providers: [
    EntitiesRepository,
    EntitiesService,
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
