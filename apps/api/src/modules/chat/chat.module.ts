import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { UsersModule } from "../users/users.module.js";
import { EntityChatController } from "./controllers/entity-chat.controller.js";
import { EntityChatGateway } from "./gateways/entity-chat.gateway.js";
import { EntityChatRepository } from "./repositories/entity-chat.repository.js";
import { ChatRateLimiterService } from "./services/chat-rate-limiter.service.js";
import { EntityChatService } from "./services/entity-chat.service.js";
import { PresenceService } from "./services/presence.service.js";

@Module({
  controllers: [EntityChatController],
  exports: [EntityChatService],
  imports: [AuthModule, EntitiesModule, UsersModule],
  providers: [
    EntityChatRepository,
    EntityChatService,
    PresenceService,
    ChatRateLimiterService,
    EntityChatGateway
  ]
})
export class ChatModule {}
