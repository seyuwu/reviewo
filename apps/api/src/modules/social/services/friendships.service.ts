import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { DotaFriendshipStatus } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtTokenService } from "../../auth/services/jwt-token.service.js";
import { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import type { CreateFriendRequestDto } from "../dto/create-friend-request.dto.js";
import type {
  FriendUserDto,
  FriendshipRequestDto,
  FriendshipRequestsResponseDto,
  FriendsListResponseDto
} from "../dto/friendship-response.dto.js";
import {
  PARTY_REALTIME_PUBLISHER,
  type PartyRealtimePublisher
} from "../party-realtime.types.js";
import { FriendshipsRepository } from "../repositories/friendships.repository.js";

@Injectable()
export class FriendshipsService {
  constructor(
    private readonly entitiesRepository: EntitiesRepository,
    private readonly friendshipsRepository: FriendshipsRepository,
    private readonly jwtTokenService: JwtTokenService,
    @Inject(PARTY_REALTIME_PUBLISHER)
    private readonly partyRealtimeService: PartyRealtimePublisher,
    private readonly usersRepository: UsersRepository
  ) {}

  async getStatusDetails(
    viewerUserId: string | undefined,
    otherUserId: string | null | undefined
  ): Promise<{ requestId: string | null; status: DotaFriendshipStatus | null }> {
    if (!otherUserId) {
      return { requestId: null, status: null };
    }

    if (!viewerUserId) {
      return { requestId: null, status: "none" };
    }

    if (viewerUserId === otherUserId) {
      return { requestId: null, status: "self" };
    }

    const edge = await this.friendshipsRepository.findBetweenUsers(viewerUserId, otherUserId);

    if (!edge) {
      return { requestId: null, status: "none" };
    }

    if (edge.status === "ACCEPTED") {
      return { requestId: edge.id, status: "friends" };
    }

    if (edge.status === "PENDING") {
      return {
        requestId: edge.id,
        status: edge.requesterId === viewerUserId ? "outgoing" : "incoming"
      };
    }

    return { requestId: null, status: "none" };
  }

  async getStatusBetween(
    viewerUserId: string | undefined,
    otherUserId: string | null | undefined
  ): Promise<DotaFriendshipStatus | null> {
    const details = await this.getStatusDetails(viewerUserId, otherUserId);
    return details.status;
  }

  createInviteToken(currentUser: AuthenticatedUser): { token: string } {
    return {
      token: this.jwtTokenService.signFriendInviteToken(currentUser.id)
    };
  }

  async requestFriendship(
    input: CreateFriendRequestDto,
    currentUser: AuthenticatedUser
  ): Promise<FriendshipRequestDto> {
    if (input.userId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot send a friend request to yourself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const target = await this.usersRepository.findById(input.userId);

    if (!target) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const existing = await this.friendshipsRepository.findBetweenUsers(currentUser.id, input.userId);

    if (existing?.status === "ACCEPTED") {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "You are already friends",
        statusCode: HttpStatus.CONFLICT
      });
    }

    if (existing?.status === "PENDING") {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Friend request already exists",
        statusCode: HttpStatus.CONFLICT
      });
    }

    if (existing?.status === "BLOCKED") {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Cannot send a friend request",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    if (existing) {
      await this.friendshipsRepository.deleteById(existing.id);
    }

    try {
      const friendship = await this.friendshipsRepository.createPending(currentUser.id, input.userId);
      const outgoing = await this.toRequestDto(
        friendship.id,
        currentUser.id,
        input.userId,
        "outgoing",
        friendship.createdAt
      );
      const incoming = await this.toRequestDto(
        friendship.id,
        input.userId,
        currentUser.id,
        "incoming",
        friendship.createdAt
      );

      this.partyRealtimeService.emitFriendNotification(input.userId, {
        request: {
          createdAt: incoming.createdAt,
          direction: "incoming",
          id: incoming.id,
          otherUser: {
            displayName: incoming.otherUser.displayName,
            dotaSlug: incoming.otherUser.dotaSlug,
            id: incoming.otherUser.id
          }
        },
        type: "friend_request"
      });

      return outgoing;
    } catch {
      const raced = await this.friendshipsRepository.findBetweenUsers(currentUser.id, input.userId);

      if (raced?.status === "ACCEPTED") {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "You are already friends",
          statusCode: HttpStatus.CONFLICT
        });
      }

      if (raced?.status === "PENDING") {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Friend request already exists",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Friend request already exists",
        statusCode: HttpStatus.CONFLICT
      });
    }
  }

  /**
   * Redeem a signed owner-shared friend invite link: instantly ACCEPTED.
   * Requires a valid HMAC JWT — knowing only a userId is not enough.
   */
  async redeemFriendInvite(
    input: { token: string },
    currentUser: AuthenticatedUser
  ): Promise<FriendUserDto> {
    const verified = this.jwtTokenService.verifyFriendInviteToken(input.token.trim());

    if (!verified) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Friend invite link is invalid or expired",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const inviterUserId = verified.inviterUserId;

    if (inviterUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot redeem your own friend invite",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const inviter = await this.usersRepository.findById(inviterUserId);

    if (!inviter) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const existing = await this.friendshipsRepository.findBetweenUsers(currentUser.id, inviterUserId);

    if (existing?.status === "BLOCKED") {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Cannot accept this friend invite",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const friendship = await this.friendshipsRepository.ensureAccepted(inviterUserId, currentUser.id);
    const friend = await this.toFriendUserDto(inviterUserId, friendship.id);

    this.partyRealtimeService.emitFriendNotification(inviterUserId, {
      request: {
        createdAt: new Date().toISOString(),
        direction: "outgoing",
        id: friendship.id,
        otherUser: {
          displayName: currentUser.displayName,
          dotaSlug: null,
          id: currentUser.id
        }
      },
      type: "friend_accepted"
    });

    return friend;
  }

  async acceptRequest(requestId: string, currentUser: AuthenticatedUser): Promise<FriendUserDto> {
    const friendship = await this.friendshipsRepository.findById(requestId);

    if (!friendship || friendship.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Friend request was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (friendship.addresseeId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the recipient can accept this request",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    await this.friendshipsRepository.updateStatus(friendship.id, "ACCEPTED");
    const friend = await this.toFriendUserDto(friendship.requesterId, friendship.id);

    this.partyRealtimeService.emitFriendNotification(friendship.requesterId, {
      request: {
        createdAt: new Date().toISOString(),
        direction: "outgoing",
        id: friendship.id,
        otherUser: {
          displayName: currentUser.displayName,
          dotaSlug: null,
          id: currentUser.id
        }
      },
      type: "friend_accepted"
    });

    return friend;
  }

  async declineRequest(requestId: string, currentUser: AuthenticatedUser): Promise<{ ok: true }> {
    const friendship = await this.friendshipsRepository.findById(requestId);

    if (!friendship || friendship.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Friend request was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (friendship.addresseeId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the recipient can decline this request",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    await this.friendshipsRepository.updateStatus(friendship.id, "DECLINED");
    return { ok: true };
  }

  async removeFriendship(otherUserId: string, currentUser: AuthenticatedUser): Promise<{ ok: true }> {
    const friendship = await this.friendshipsRepository.findBetweenUsers(currentUser.id, otherUserId);

    if (!friendship) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Friendship was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    await this.friendshipsRepository.deleteById(friendship.id);
    return { ok: true };
  }

  async listFriends(currentUser: AuthenticatedUser): Promise<FriendsListResponseDto> {
    const rows = await this.friendshipsRepository.listAcceptedForUser(currentUser.id);
    const friends = await Promise.all(
      rows.map((row) => {
        const otherUserId = row.requesterId === currentUser.id ? row.addresseeId : row.requesterId;
        return this.toFriendUserDto(otherUserId, row.id);
      })
    );

    return { friends };
  }

  async listRequests(currentUser: AuthenticatedUser): Promise<FriendshipRequestsResponseDto> {
    const rows = await this.friendshipsRepository.listPendingForUser(currentUser.id);
    const incoming: FriendshipRequestDto[] = [];
    const outgoing: FriendshipRequestDto[] = [];

    for (const row of rows) {
      if (row.addresseeId === currentUser.id) {
        incoming.push(
          await this.toRequestDto(row.id, currentUser.id, row.requesterId, "incoming", row.createdAt)
        );
      } else {
        outgoing.push(
          await this.toRequestDto(row.id, currentUser.id, row.addresseeId, "outgoing", row.createdAt)
        );
      }
    }

    return { incoming, outgoing };
  }

  private async toFriendUserDto(userId: string, friendshipId: string | null): Promise<FriendUserDto> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const dotaEntity = await this.entitiesRepository.findByOwnerUserId(userId);

    return {
      displayName: user.displayName,
      dotaSlug: dotaEntity?.slug ?? null,
      friendshipId,
      id: user.id
    };
  }

  private async toRequestDto(
    friendshipId: string,
    _viewerId: string,
    otherUserId: string,
    direction: "incoming" | "outgoing",
    createdAt: Date
  ): Promise<FriendshipRequestDto> {
    return {
      createdAt: createdAt.toISOString(),
      direction,
      id: friendshipId,
      otherUser: await this.toFriendUserDto(otherUserId, friendshipId)
    };
  }
}
