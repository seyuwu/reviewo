import { Module } from "@nestjs/common";

import { DomainEventsModule } from "../../common/domain-events/domain-events.module.js";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { RecommendationModule } from "../recommendation/recommendation.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminAnalyticsController, AdminCommunityController } from "./controllers/admin-community.controller.js";
import { CommunityController } from "./controllers/community.controller.js";
import { SpotlightController } from "./controllers/spotlight.controller.js";
import { ActivityEventHandlers } from "./handlers/activity-event-handlers.js";
import { ActivityEventsRepository } from "./repositories/activity-events.repository.js";
import { ContributeQueuesRepository } from "./repositories/contribute-queues.repository.js";
import { ContributionBadgeRepository } from "./repositories/contribution-badge.repository.js";
import { ContributionSnapshotRepository } from "./repositories/contribution-snapshot.repository.js";
import { CuratorRankSnapshotRepository } from "./repositories/curator-rank-snapshot.repository.js";
import { ExpertiseSnapshotRepository } from "./repositories/expertise-snapshot.repository.js";
import { SpotlightCreditsRepository } from "./repositories/spotlight-credits.repository.js";
import { SpotlightPlacementsRepository } from "./repositories/spotlight-placements.repository.js";
import { SpotlightPlacementEventsRepository } from "./repositories/spotlight-placement-events.repository.js";
import { ActivityEventsService } from "./services/activity-events.service.js";
import { AdminCommunityService } from "./services/admin-community.service.js";
import { CommunityService } from "./services/community.service.js";
import { ContributionBackfillService } from "./services/contribution-backfill.service.js";
import { ContributionPhase2BackfillService } from "./services/contribution-phase2-backfill.service.js";
import { ContributionSnapshotService } from "./services/contribution-snapshot.service.js";
import { SpotlightCreditsService } from "./services/spotlight-credits.service.js";
import { SpotlightEndorsementService } from "./services/spotlight-endorsement.service.js";
import { SpotlightService } from "./services/spotlight.service.js";
import { PlatformHealthService } from "./services/platform-health.service.js";
import { SpotlightAnalyticsService } from "./services/spotlight-analytics.service.js";
import { SpotlightTrackingService } from "./services/spotlight-tracking.service.js";

@Module({
  controllers: [AdminAnalyticsController, AdminCommunityController, CommunityController, SpotlightController],
  imports: [
    AnalyticsModule,
    AuthModule,
    DomainEventsModule,
    EntitiesModule,
    RateLimitingModule,
    RecommendationModule,
    UsersModule
  ],
  providers: [
    ActivityEventsRepository,
    ActivityEventsService,
    ActivityEventHandlers,
    AdminCommunityService,
    CommunityService,
    ContributeQueuesRepository,
    ContributionBackfillService,
    ContributionBadgeRepository,
    ContributionPhase2BackfillService,
    ContributionSnapshotRepository,
    ContributionSnapshotService,
    CuratorRankSnapshotRepository,
    ExpertiseSnapshotRepository,
    PlatformHealthService,
    SpotlightCreditsRepository,
    SpotlightCreditsService,
    SpotlightPlacementEventsRepository,
    SpotlightPlacementsRepository,
    SpotlightAnalyticsService,
    SpotlightEndorsementService,
    SpotlightService,
    SpotlightTrackingService
  ]
})
export class CommunityModule {}
