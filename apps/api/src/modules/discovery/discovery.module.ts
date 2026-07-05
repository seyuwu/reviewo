import { Module } from "@nestjs/common";

import { ChatModule } from "../chat/chat.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { BattleVoteRepository } from "../growth/repositories/battle-vote.repository.js";
import { DiscoveryController } from "./controllers/discovery.controller.js";
import { DiscoveryRepository } from "./repositories/discovery.repository.js";
import { DiscoveryService } from "./services/discovery.service.js";

@Module({
  controllers: [DiscoveryController],
  imports: [ChatModule, EntitiesModule],
  providers: [BattleVoteRepository, DiscoveryRepository, DiscoveryService]
})
export class DiscoveryModule {}
