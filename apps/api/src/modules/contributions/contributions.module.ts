import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { TopsModule } from "../tops/tops.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminContributionsController } from "./controllers/admin-contributions.controller.js";
import { ContributionsController } from "./controllers/contributions.controller.js";
import { ContributionsRepository } from "./repositories/contributions.repository.js";
import { ContributionEvaluatorService } from "./services/contribution-evaluator.service.js";
import { ContributionVoteWeightService } from "./services/contribution-vote-weight.service.js";
import { ContributionsService } from "./services/contributions.service.js";
import { DuplicateDetectionService } from "./services/duplicate-detection.service.js";
import { EntityMergeService } from "./services/entity-merge.service.js";

@Module({
  controllers: [ContributionsController, AdminContributionsController],
  exports: [ContributionsService],
  imports: [AuthModule, EntitiesModule, TopsModule, UsersModule],
  providers: [
    ContributionsRepository,
    ContributionsService,
    ContributionEvaluatorService,
    ContributionVoteWeightService,
    DuplicateDetectionService,
    EntityMergeService
  ]
})
export class ContributionsModule {}
