import { Module } from "@nestjs/common";

import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";
import { AppLogger } from "./common/logger/app-logger.service.js";
import { AppConfigModule } from "./config/app-config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { EntityPageModule } from "./modules/entity-page/entity-page.module.js";
import { EntitiesModule } from "./modules/entities/entities.module.js";
import { ExtensionApiModule } from "./modules/extension-api/extension-api.module.js";
import { ModerationModule } from "./modules/moderation/moderation.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { RatingsModule } from "./modules/ratings/ratings.module.js";
import { RecommendationModule } from "./modules/recommendation/recommendation.module.js";
import { ReviewsModule } from "./modules/reviews/reviews.module.js";
import { SearchModule } from "./modules/search/search.module.js";
import { TrustModule } from "./modules/trust/trust.module.js";
import { UsersModule } from "./modules/users/users.module.js";

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EntitiesModule,
    EntityPageModule,
    ExtensionApiModule,
    RatingsModule,
    ReviewsModule,
    TrustModule,
    SearchModule,
    NotificationsModule,
    ModerationModule,
    RecommendationModule
  ],
  providers: [AppLogger, GlobalExceptionFilter]
})
export class AppModule {}
