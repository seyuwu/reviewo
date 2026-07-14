import { Module } from "@nestjs/common";

import { FriendshipsModule } from "./friendships.module.js";
import { PartiesModule } from "./parties.module.js";

@Module({
  exports: [FriendshipsModule, PartiesModule],
  imports: [FriendshipsModule, PartiesModule]
})
export class SocialModule {}
