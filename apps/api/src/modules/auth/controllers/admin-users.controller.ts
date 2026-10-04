import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { UsersService } from "../../users/services/users.service.js";
import { AdminUserSearchDto } from "../dto/admin-user-search.dto.js";
import { SetTournamentModeratorDto } from "../dto/set-tournament-moderator.dto.js";
import { AdminGuard } from "../guards/admin.guard.js";
import { JwtAuthGuard } from "../guards/jwt-auth.guard.js";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly usersService: UsersService
  ) {}

  @Get("search")
  search(@Query() input: AdminUserSearchDto) {
    return this.usersService.searchRoleManagementUsers(input.q);
  }

  @Patch(":userId/tournament-moderator")
  async setTournamentModerator(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() input: SetTournamentModeratorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: actor.id,
        limit: 20,
        message: "Too many tournament moderator changes from this account",
        namespace: "admin:tournament-moderator:user",
        windowSeconds: 60 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 60,
        message: "Too many tournament moderator changes from this network",
        namespace: "admin:tournament-moderator:ip",
        windowSeconds: 60 * 60
      }
    ]);

    const result = await this.usersService.setTournamentModerator(userId, input.enabled);
    this.logger.log(
      `Tournament moderator ${input.enabled ? "granted" : "revoked"}: actor=${actor.id} target=${userId}`
    );
    return result;
  }
}
