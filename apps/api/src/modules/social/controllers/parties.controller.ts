import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import { CreateGamePartyDto } from "../dto/create-game-party.dto.js";
import { CreatePartyInviteDto } from "../dto/create-party-invite.dto.js";
import type {
  GamePartyChatMessageDto,
  GamePartyChatMessagesPageDto,
  GamePartyInviteDto,
  GamePartyResponseDto,
  MyPartiesResponseDto
} from "../dto/game-party-response.dto.js";
import { ListPartyChatMessagesQueryDto, SendPartyChatMessageDto } from "../dto/party-chat.dto.js";
import { UpdateGamePartyDto } from "../dto/update-game-party.dto.js";
import { GamePartiesService } from "../services/game-parties.service.js";

@Controller("social/parties")
export class PartiesController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly gamePartiesService: GamePartiesService
  ) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMyParties(@CurrentUser() currentUser: AuthenticatedUser): Promise<MyPartiesResponseDto> {
    return this.gamePartiesService.getMyParties(currentUser);
  }

  @Post("invites/:id/accept")
  @UseGuards(JwtAuthGuard)
  async acceptInvite(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.acceptInvite(id, currentUser);
  }

  @Post("invites/:id/decline")
  @UseGuards(JwtAuthGuard)
  async declineInvite(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.declineInvite(id, currentUser);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createParty(
    @Body() input: CreateGamePartyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.createParty(input, currentUser);
  }

  @Get(":slug")
  @UseGuards(OptionalJwtAuthGuard)
  getParty(
    @Param("slug") slug: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    return this.gamePartiesService.getPartyBySlug(slug, currentUser?.id);
  }

  @Patch(":slug")
  @UseGuards(JwtAuthGuard)
  async renameParty(
    @Param("slug") slug: string,
    @Body() input: UpdateGamePartyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.renameParty(slug, input.name, currentUser);
  }

  @Get(":slug/messages")
  @UseGuards(JwtAuthGuard)
  listMessages(
    @Param("slug") slug: string,
    @Query() query: ListPartyChatMessagesQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<GamePartyChatMessagesPageDto> {
    return this.gamePartiesService.listChatMessages(slug, currentUser, query.before, query.limit);
  }

  @Post(":slug/messages")
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Param("slug") slug: string,
    @Body() input: SendPartyChatMessageDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyChatMessageDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.sendChatMessage(slug, input.message, currentUser);
  }

  @Post(":slug/invites")
  @UseGuards(JwtAuthGuard)
  async inviteFriend(
    @Param("slug") slug: string,
    @Body() input: CreatePartyInviteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyInviteDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.inviteFriend(slug, input, currentUser);
  }

  @Delete(":slug/members/me")
  @UseGuards(JwtAuthGuard)
  async leaveParty(
    @Param("slug") slug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.leaveParty(slug, currentUser);
  }
}
