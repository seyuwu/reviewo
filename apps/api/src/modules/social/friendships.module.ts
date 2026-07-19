import { Module, forwardRef } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { UsersModule } from "../users/users.module.js";
import { FriendsController } from "./controllers/friends.controller.js";
import { FriendshipsRepository } from "./repositories/friendships.repository.js";
import { FriendshipsService } from "./services/friendships.service.js";
import { PartiesModule } from "./parties.module.js";

@Module({
  controllers: [FriendsController],
  exports: [FriendshipsRepository, FriendshipsService],
  imports: [
    AuthModule,
    EntitiesModule,
    forwardRef(() => PartiesModule),
    RateLimitingModule,
    UsersModule
  ],
  providers: [FriendshipsRepository, FriendshipsService]
})
export class FriendshipsModule {}
