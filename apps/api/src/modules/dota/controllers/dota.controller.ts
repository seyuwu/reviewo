import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createDotaConfirmationRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import { ConfirmDotaQualitiesDto } from "../dto/confirm-dota-qualities.dto.js";
import { CreateDotaProfileDto } from "../dto/create-dota-profile.dto.js";
import { DotaProfileResponseDto } from "../dto/dota-profile-response.dto.js";
import type { DotaLfgListResponseDto } from "../dto/dota-lfg-response.dto.js";
import type { DotaProfileSearchResponseDto } from "../dto/dota-profile-search-response.dto.js";
import { GuestDotaProfileCreateResponseDto } from "../dto/guest-dota-profile-create-response.dto.js";
import { ListDotaLfgQueryDto } from "../dto/list-dota-lfg-query.dto.js";
import { SearchDotaProfilesQueryDto } from "../dto/search-dota-profiles-query.dto.js";
import { SetDotaLfgLookingDto } from "../dto/set-dota-lfg-looking.dto.js";
import { UpdateDotaProfileDto } from "../dto/update-dota-profile.dto.js";
import { DotaProfileService } from "../services/dota-profile.service.js";

@Controller("dota/profiles")
export class DotaController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly dotaProfileService: DotaProfileService
  ) {}

  @Post("guest")
  async createGuestProfile(
    @Body() input: CreateDotaProfileDto,
    @Req() request: RequestLike,
    @Headers("authorization") authorization?: string
  ): Promise<GuestDotaProfileCreateResponseDto> {
    if (authorization?.trim()) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Already signed in — use POST /dota/profiles instead",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 10,
        message: "Too many guest profile attempts from this network",
        namespace: "dota:guest-create:ip",
        windowSeconds: 60 * 60
      }
    ]);

    return this.dotaProfileService.createGuestProfile(input);
  }

  @Get("lfg")
  async listLookingPlayers(@Query() query: ListDotaLfgQueryDto): Promise<DotaLfgListResponseDto> {
    return this.dotaProfileService.listLookingPlayers({
      ...(query.roles ? { roles: query.roles } : {}),
      ...(query.server ? { server: query.server } : {})
    });
  }

  @Post("lfg/looking")
  @UseGuards(JwtAuthGuard)
  async setLooking(
    @Body() input: SetDotaLfgLookingDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.setLooking(input.looking, currentUser, {
      ...(input.recruitedRoles !== undefined ? { recruitedRoles: input.recruitedRoles } : {}),
      ...(input.partySlug ? { partySlug: input.partySlug } : {})
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createProfile(
    @Body() input: CreateDotaProfileDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.createProfile(input, currentUser);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@CurrentUser() currentUser: AuthenticatedUser): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.getMyProfile(currentUser);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  async updateMyProfile(
    @Body() input: UpdateDotaProfileDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.updateMyProfile(input, currentUser);
  }

  @Get("search")
  async searchProfiles(
    @Query() query: SearchDotaProfilesQueryDto
  ): Promise<DotaProfileSearchResponseDto> {
    return this.dotaProfileService.searchProfiles(query.query);
  }

  @Get("by-id/:accountId")
  @UseGuards(OptionalJwtAuthGuard)
  async getProfileByAccountId(
    @Param("accountId") accountId: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.getPublicProfileByAccountId(accountId, currentUser?.id);
  }

  @Get("by-username/:username")
  @UseGuards(OptionalJwtAuthGuard)
  async getProfileByUsername(
    @Param("username") username: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.getPublicProfileByUsername(username, currentUser?.id);
  }

  @Get(":slug")
  @UseGuards(OptionalJwtAuthGuard)
  async getProfileBySlug(
    @Param("slug") slug: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    return this.dotaProfileService.getPublicProfileBySlug(slug, currentUser?.id);
  }

  @Post(":slug/confirm")
  @UseGuards(OptionalJwtAuthGuard)
  async confirmQualities(
    @Param("slug") slug: string,
    @Body() input: ConfirmDotaQualitiesDto,
    @Req() request: RequestLike,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    const rateLimitRules = createDotaConfirmationRateLimitRules(request);

    await this.apiRateLimiterService.checkWithinLimits(rateLimitRules);

    const response = await this.dotaProfileService.confirmQualities(slug, input, request, currentUser);

    await this.apiRateLimiterService.recordLimits(rateLimitRules);

    return response;
  }

  @Delete(":slug/confirm")
  @UseGuards(OptionalJwtAuthGuard)
  async revokeQuality(
    @Param("slug") slug: string,
    @Body() input: ConfirmDotaQualitiesDto,
    @Req() request: RequestLike,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    const rateLimitRules = createDotaConfirmationRateLimitRules(request);

    await this.apiRateLimiterService.checkWithinLimits(rateLimitRules);

    const response = await this.dotaProfileService.revokeQuality(slug, input, request, currentUser);

    await this.apiRateLimiterService.recordLimits(rateLimitRules);

    return response;
  }
}
