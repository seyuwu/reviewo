import { Module } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { DotaModule } from "../dota/dota.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { UsersModule } from "../users/users.module.js";
import { PartiesController } from "./controllers/parties.controller.js";
import { FriendshipsModule } from "./friendships.module.js";
import { GamePartiesRepository } from "./repositories/game-parties.repository.js";
import { GamePartiesService } from "./services/game-parties.service.js";

@Module({
  controllers: [PartiesController],
  exports: [GamePartiesService],
  imports: [
    AuthModule,
    ChatModule,
    DotaModule,
    EntitiesModule,
    FriendshipsModule,
    RateLimitingModule,
    UsersModule
  ],
  providers: [GamePartiesRepository, GamePartiesService]
})
export class PartiesModule {}
