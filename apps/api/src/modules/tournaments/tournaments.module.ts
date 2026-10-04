import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DotaModule } from "../dota/dota.module.js";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { PartiesModule } from "../social/parties.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminDotaTournamentsController } from "./tournaments-admin.controller.js";
import { DotaTournamentsController } from "./tournaments.controller.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { TournamentManagerGuard } from "./tournament-manager.guard.js";

@Module({
  controllers: [AdminDotaTournamentsController, DotaTournamentsController],
  exports: [DotaTournamentsService],
  imports: [AuthModule, DotaModule, PartiesModule, RateLimitingModule, UsersModule],
  providers: [DotaTournamentsService, TournamentManagerGuard]
})
export class DotaTournamentsModule {}
