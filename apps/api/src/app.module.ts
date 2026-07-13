import { Module } from "@nestjs/common";

import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";
import { AppLogger } from "./common/logger/app-logger.service.js";
import { RateLimitingModule } from "./common/rate-limiting/rate-limiting.module.js";
import { AppConfigModule } from "./config/app-config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { GrowthModule } from "./modules/growth/growth.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ChatModule } from "./modules/chat/chat.module.js";
import { CommunityModule } from "./modules/community/community.module.js";
import { ContributionsModule } from "./modules/contributions/contributions.module.js";
import { DotaModule } from "./modules/dota/dota.module.js";
import { DiscoveryModule } from "./modules/discovery/discovery.module.js";
import { EntityPageModule } from "./modules/entity-page/entity-page.module.js";
import { EntitiesModule } from "./modules/entities/entities.module.js";
import { ExtensionApiModule } from "./modules/extension-api/extension-api.module.js";
import { ModerationModule } from "./modules/moderation/moderation.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { RatingsModule } from "./modules/ratings/ratings.module.js";
import { RecommendationModule } from "./modules/recommendation/recommendation.module.js";
import { ReputationModule } from "./modules/reputation/reputation.module.js";
import { ReviewsModule } from "./modules/reviews/reviews.module.js";
import { SearchModule } from "./modules/search/search.module.js";
import { TopsModule } from "./modules/tops/tops.module.js";
import { TrustModule } from "./modules/trust/trust.module.js";
import { UsersModule } from "./modules/users/users.module.js";

import { RedisModule } from "./redis/redis.module.js";

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    RateLimitingModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EntitiesModule,
    ContributionsModule,
    EntityPageModule,
    ExtensionApiModule,
    RatingsModule,
    ReviewsModule,
    TopsModule,
    TrustModule,
    SearchModule,
    NotificationsModule,
    ModerationModule,
    RecommendationModule,
    ReputationModule,
    ChatModule,
    CommunityModule,
    DiscoveryModule,
    DotaModule,
    GrowthModule
  ],
  providers: [AppLogger, GlobalExceptionFilter]
})
export class AppModule {}
