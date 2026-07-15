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
import { JoinPartyByTokenDto } from "../dto/join-party-by-token.dto.js";
import { ListPartyChatMessagesQueryDto, SendPartyChatMessageDto } from "../dto/party-chat.dto.js";
import { StackInviteDto } from "../dto/stack-invite.dto.js";
import { UpdateGamePartyDto } from "../dto/update-game-party.dto.js";
import { UpdatePartyMemberPositionDto } from "../dto/update-party-member-position.dto.js";
import { GamePartyGateway } from "../gateways/game-party.gateway.js";
import { GamePartiesService } from "../services/game-parties.service.js";

@Controller("social/parties")
export class PartiesController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly gamePartiesService: GamePartiesService,
    private readonly gamePartyGateway: GamePartyGateway
  ) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMyParties(@CurrentUser() currentUser: AuthenticatedUser): Promise<MyPartiesResponseDto> {
    return this.gamePartiesService.getMyParties(currentUser);
  }

  @Post("join")
  @UseGuards(JwtAuthGuard)
  async joinByToken(
    @Body() input: JoinPartyByTokenDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    const party = await this.gamePartiesService.joinByToken(input.token, currentUser);
    this.gamePartyGateway.broadcastPartyUpdated(party);
    return party;
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

    const party = await this.gamePartiesService.acceptInvite(id, currentUser);
    this.gamePartyGateway.broadcastPartyUpdated(party);
    return party;
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

  @Post("stack")
  @UseGuards(JwtAuthGuard)
  async stackInvite(
    @Body() input: StackInviteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ invite: GamePartyInviteDto; party: GamePartyResponseDto }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.stackInvite(
      input.targetSlug,
      currentUser,
      input.partySlug,
      input.positionRole
    );
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

    const party = await this.gamePartiesService.renameParty(slug, input.name, currentUser);
    this.gamePartyGateway.broadcastPartyUpdated(party);
    return party;
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
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<GamePartyChatMessageDto> {
    const message = await this.gamePartiesService.sendChatMessage(
      slug,
      input.message,
      currentUser
    );
    const party = await this.gamePartiesService.getPartyBySlug(slug, currentUser.id);
    this.gamePartyGateway.broadcastNewMessage(party.id, message);
    return message;
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

  @Post(":slug/join-token")
  @UseGuards(JwtAuthGuard)
  async createJoinToken(
    @Param("slug") slug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ token: string }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.gamePartiesService.createJoinToken(slug, currentUser);
  }

  @Delete(":slug")
  @UseGuards(JwtAuthGuard)
  async disbandParty(
    @Param("slug") slug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    const party = await this.gamePartiesService.getPartyBySlug(slug, currentUser.id).catch(() => null);
    const result = await this.gamePartiesService.disbandParty(slug, currentUser);

    if (party) {
      this.gamePartyGateway.broadcastPartyUpdated({
        ...party,
        isMember: false,
        isOwner: false,
        memberCount: 0,
        members: [],
        openSlots: party.maxMembers
      });
    }

    return result;
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

    const party = await this.gamePartiesService.getPartyBySlug(slug, currentUser.id);
    const result = await this.gamePartiesService.leaveParty(slug, currentUser);
    const updated = await this.gamePartiesService.getPartyBySlug(slug).catch(() => null);

    if (updated) {
      this.gamePartyGateway.broadcastPartyUpdated(updated);
    } else {
      this.gamePartyGateway.broadcastPartyUpdated({
        ...party,
        isMember: false,
        memberCount: Math.max(0, party.memberCount - 1),
        members: party.members.filter((member) => member.userId !== currentUser.id),
        openSlots: Math.min(party.maxMembers, party.openSlots + 1)
      });
    }

    return result;
  }

  @Patch(":slug/members/me/position")
  @UseGuards(JwtAuthGuard)
  async updateMyPosition(
    @Param("slug") slug: string,
    @Body() input: UpdatePartyMemberPositionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    const party = await this.gamePartiesService.updateMyPosition(
      slug,
      input.positionRole,
      currentUser
    );
    this.gamePartyGateway.broadcastPartyUpdated(party);
    return party;
  }

  @Delete(":slug/members/:userId")
  @UseGuards(JwtAuthGuard)
  async kickMember(
    @Param("slug") slug: string,
    @Param("userId") userId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<GamePartyResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    const party = await this.gamePartiesService.kickMember(slug, userId, currentUser);
    this.gamePartyGateway.broadcastPartyUpdated(party);
    return party;
  }
}
