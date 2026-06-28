import { Module } from "@nestjs/common";

import { DomainEventsModule } from "../../common/domain-events/domain-events.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { TrustModule } from "../trust/trust.module.js";
import { UsersModule } from "../users/users.module.js";
import { ReputationController } from "./controllers/reputation.controller.js";
import { ReputationEventHandlers } from "./handlers/reputation-event-handlers.js";
import { ReputationUserAccessGuard } from "./guards/reputation-user-access.guard.js";
import { ReputationEngineEnabledGuard } from "./guards/reputation-engine-enabled.guard.js";
import { ReputationReadRepository } from "./repositories/reputation-read.repository.js";
import { ReputationRepository } from "./repositories/reputation.repository.js";
import { ReputationBackfillService } from "./services/reputation-backfill.service.js";
import { ReputationCalculationContext } from "./services/reputation-calculation-context.service.js";
import { ReputationDisplayService } from "./services/reputation-display.service.js";
import { ReputationReplayService } from "./services/reputation-replay.service.js";
import { REPUTATION_PORT } from "./interfaces/reputation.port.js";
import { AnomalyDetectionService } from "./services/anomaly-detection.service.js";
import { EntityConfidenceCalculator } from "./services/entity-confidence-calculator.service.js";
import { ReputationService } from "./services/reputation.service.js";
import { UserTrustCalculator } from "./services/user-trust-calculator.service.js";
import { VoteWeightCalculator } from "./services/vote-weight-calculator.service.js";

@Module({
  controllers: [ReputationController],
  exports: [REPUTATION_PORT, ReputationDisplayService],
  imports: [AuthModule, DomainEventsModule, TrustModule, UsersModule],
  providers: [
    ReputationCalculationContext,
    ReputationReadRepository,
    ReputationRepository,
    UserTrustCalculator,
    VoteWeightCalculator,
    EntityConfidenceCalculator,
    AnomalyDetectionService,
    ReputationService,
    ReputationDisplayService,
    {
      provide: REPUTATION_PORT,
      useExisting: ReputationDisplayService
    },
    ReputationBackfillService,
    ReputationReplayService,
    ReputationEventHandlers,
    ReputationUserAccessGuard,
    ReputationEngineEnabledGuard
  ]
})
export class ReputationModule {}
