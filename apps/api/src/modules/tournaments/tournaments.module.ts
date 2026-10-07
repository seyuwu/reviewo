import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DotaModule } from "../dota/dota.module.js";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { PartiesModule } from "../social/parties.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminDotaTournamentsController } from "./tournaments-admin.controller.js";
import { DotaTournamentsController } from "./tournaments.controller.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { TournamentManagerGuard } from "./tournament-manager.guard.js";
import { DotaTournamentRoomsService } from "./tournament-rooms.service.js";
import { DotaTournamentRoomsController } from "./tournament-rooms.controller.js";
import { DotaTournamentRoomsGateway } from "./tournament-rooms.gateway.js";
import { TournamentRoomEvents } from "./tournament-room-events.js";
import { DotaTournamentPlansService } from "./tournament-plans.service.js";
import { TournamentDisputeNotificationsService } from "./tournament-dispute-notifications.service.js";
import { TournamentNotificationsController } from "./tournament-notifications.controller.js";
import { TournamentMatchChatService } from "./tournament-match-chat.service.js";
import { TournamentMatchChatController } from "./tournament-match-chat.controller.js";

@Module({
  controllers: [AdminDotaTournamentsController, DotaTournamentRoomsController, DotaTournamentsController, TournamentNotificationsController, TournamentMatchChatController],
  exports: [DotaTournamentsService],
  imports: [AuthModule, DotaModule, PartiesModule, RateLimitingModule, UsersModule],
  providers: [DotaTournamentBracketService, DotaTournamentsService, TournamentManagerGuard,
    DotaTournamentRoomsService, DotaTournamentRoomsGateway, TournamentRoomEvents, DotaTournamentPlansService, TournamentDisputeNotificationsService, TournamentMatchChatService]
})
export class DotaTournamentsModule {}
