import { Module } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { FriendshipsModule } from "../social/friendships.module.js";
import { UsersModule } from "../users/users.module.js";
import { DotaController } from "./controllers/dota.controller.js";
import { EntityAttributesRepository } from "./repositories/entity-attributes.repository.js";
import { EntityQualityConfirmationsRepository } from "./repositories/entity-quality-confirmations.repository.js";
import { DotaProfileService } from "./services/dota-profile.service.js";

@Module({
  controllers: [DotaController],
  exports: [DotaProfileService, EntityAttributesRepository],
  imports: [AuthModule, EntitiesModule, FriendshipsModule, RateLimitingModule, UsersModule],
  providers: [
    DotaProfileService,
    EntityAttributesRepository,
    EntityQualityConfirmationsRepository
  ]
})
export class DotaModule {}
