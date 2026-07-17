import { Module, forwardRef } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DotaModule } from "../dota/dota.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { GamesLaunchModule } from "../games-launch/games-launch.module.js";
import { UsersModule } from "../users/users.module.js";
import { PartiesController } from "./controllers/parties.controller.js";
import { FriendshipsModule } from "./friendships.module.js";
import { GamePartyGateway } from "./gateways/game-party.gateway.js";
import { GamePartiesRepository } from "./repositories/game-parties.repository.js";
import { GamePartiesService } from "./services/game-parties.service.js";
import { PartyRealtimeService } from "./services/party-realtime.service.js";
import { PARTY_REALTIME_PUBLISHER } from "./party-realtime.types.js";

@Module({
  controllers: [PartiesController],
  exports: [
    GamePartiesService,
    GamePartyGateway,
    GamePartiesRepository,
    PartyRealtimeService,
    PARTY_REALTIME_PUBLISHER
  ],
  imports: [
    AuthModule,
    forwardRef(() => DotaModule),
    EntitiesModule,
    FriendshipsModule,
    GamesLaunchModule,
    RateLimitingModule,
    UsersModule
  ],
  providers: [
    GamePartiesRepository,
    GamePartiesService,
    GamePartyGateway,
    PartyRealtimeService,
    {
      provide: PARTY_REALTIME_PUBLISHER,
      useExisting: PartyRealtimeService
    }
  ]
})
export class PartiesModule {}
