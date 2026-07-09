import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { TopsModule } from "../tops/tops.module.js";
import { UsersModule } from "../users/users.module.js";
import { ModerationController } from "./controllers/moderation.controller.js";
import { ModerationService } from "./services/moderation.service.js";

@Module({
  controllers: [ModerationController],
  imports: [AuthModule, EntitiesModule, ReviewsModule, TopsModule, UsersModule],
  providers: [ModerationService]
})
export class ModerationModule {}
