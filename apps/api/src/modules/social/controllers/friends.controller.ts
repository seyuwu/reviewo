import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { CreateFriendRequestDto } from "../dto/create-friend-request.dto.js";
import { RedeemFriendInviteDto } from "../dto/redeem-friend-invite.dto.js";
import type {
  FriendshipRequestDto,
  FriendshipRequestsResponseDto,
  FriendsListResponseDto,
  FriendUserDto
} from "../dto/friendship-response.dto.js";
import { FriendshipsService } from "../services/friendships.service.js";

@Controller("social/friends")
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly friendshipsService: FriendshipsService
  ) {}

  @Get()
  listFriends(@CurrentUser() currentUser: AuthenticatedUser): Promise<FriendsListResponseDto> {
    return this.friendshipsService.listFriends(currentUser);
  }

  @Get("requests")
  listRequests(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<FriendshipRequestsResponseDto> {
    return this.friendshipsService.listRequests(currentUser);
  }

  @Post("requests")
  async createRequest(
    @Body() input: CreateFriendRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<FriendshipRequestDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.friendshipsService.requestFriendship(input, currentUser);
  }

  @Get("invite-token")
  createInviteToken(@CurrentUser() currentUser: AuthenticatedUser): { token: string } {
    return this.friendshipsService.createInviteToken(currentUser);
  }

  @Post("invite/redeem")
  async redeemFriendInvite(
    @Body() input: RedeemFriendInviteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<FriendUserDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.friendshipsService.redeemFriendInvite(input, currentUser);
  }

  @Post("requests/:id/accept")
  async acceptRequest(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<FriendUserDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.friendshipsService.acceptRequest(id, currentUser);
  }

  @Post("requests/:id/decline")
  async declineRequest(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.friendshipsService.declineRequest(id, currentUser);
  }

  @Delete(":userId")
  async removeFriendship(
    @Param("userId") userId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );

    return this.friendshipsService.removeFriendship(userId, currentUser);
  }
}
