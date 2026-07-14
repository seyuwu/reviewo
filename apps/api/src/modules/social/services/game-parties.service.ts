import { HttpStatus, Injectable } from "@nestjs/common";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_PARTY_SIZE,
  DOTA_PARTY_VERTICAL,
  DOTA_TEMP_PARTY_TTL_HOURS,
  generateDotaPartyName,
  type GamePartyKind
} from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { ChatRateLimiterService } from "../../chat/services/chat-rate-limiter.service.js";
import { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import { createSlug } from "../../entities/services/entity-slug.js";
import { EntityAttributesRepository } from "../../dota/repositories/entity-attributes.repository.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import type { CreateGamePartyDto } from "../dto/create-game-party.dto.js";
import type { CreatePartyInviteDto } from "../dto/create-party-invite.dto.js";
import type {
  GamePartyChatMessageDto,
  GamePartyChatMessagesPageDto,
  GamePartyInviteDto,
  GamePartyMemberDto,
  GamePartyResponseDto,
  MyPartiesResponseDto
} from "../dto/game-party-response.dto.js";
import { FriendshipsRepository } from "../repositories/friendships.repository.js";
import { GamePartiesRepository } from "../repositories/game-parties.repository.js";

@Injectable()
export class GamePartiesService {
  constructor(
    private readonly chatRateLimiterService: ChatRateLimiterService,
    private readonly entityAttributesRepository: EntityAttributesRepository,
    private readonly entitiesRepository: EntitiesRepository,
    private readonly friendshipsRepository: FriendshipsRepository,
    private readonly gamePartiesRepository: GamePartiesRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  async createParty(
    input: CreateGamePartyDto,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const kind = input.kind ?? "TEAM";
    await this.assertNoActiveMembershipOfKind(currentUser.id, kind);

    const providedName = input.name?.trim();
    const name =
      providedName && providedName.length >= 2 ? providedName : generateDotaPartyName();
    const slug = await this.createAvailableSlug(createSlug(name), kind);
    const expiresAt =
      kind === "PARTY"
        ? new Date(Date.now() + DOTA_TEMP_PARTY_TTL_HOURS * 60 * 60 * 1000)
        : null;

    const party = await this.gamePartiesRepository.createParty({
      expiresAt,
      kind,
      maxMembers: DOTA_PARTY_SIZE,
      name,
      ownerUserId: currentUser.id,
      slug,
      vertical: DOTA_PARTY_VERTICAL
    });

    const full = await this.gamePartiesRepository.findById(party.id);

    if (!full) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.toPartyResponse(full, currentUser.id);
  }

  async renameParty(
    slug: string,
    name: string,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party || this.isExpired(party)) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (party.ownerUserId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the owner can rename this team",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const nextName = name.trim();

    if (nextName.length < 2) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Name is too short",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    await this.gamePartiesRepository.updatePartyName(party.id, nextName);
    const updated = await this.gamePartiesRepository.findById(party.id);

    if (!updated) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.toPartyResponse(updated, currentUser.id);
  }

  async getPartyBySlug(slug: string, viewerUserId?: string): Promise<GamePartyResponseDto> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party || this.isExpired(party)) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.toPartyResponse(party, viewerUserId);
  }

  async getMyParties(currentUser: AuthenticatedUser): Promise<MyPartiesResponseDto> {
    const [teamMembership, partyMembership, invites] = await Promise.all([
      this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
        currentUser.id,
        DOTA_PARTY_VERTICAL,
        "TEAM"
      ),
      this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
        currentUser.id,
        DOTA_PARTY_VERTICAL,
        "PARTY"
      ),
      this.gamePartiesRepository.listPendingInvitesForUser(currentUser.id)
    ]);

    const team = teamMembership
      ? await this.loadPartyResponse(teamMembership.partyId, currentUser.id)
      : null;
    const party = partyMembership
      ? await this.loadPartyResponse(partyMembership.partyId, currentUser.id)
      : null;

    const now = Date.now();

    return {
      invites: invites
        .filter((invite) => {
          if (invite.party.kind !== "PARTY" || !invite.party.expiresAt) {
            return true;
          }

          return invite.party.expiresAt.getTime() > now;
        })
        .map((invite) => ({
          createdAt: invite.createdAt.toISOString(),
          expiresAt: invite.party.expiresAt?.toISOString() ?? null,
          id: invite.id,
          inviteeDisplayName: invite.invitee.displayName,
          inviteeUserId: invite.inviteeUserId,
          kind: invite.party.kind,
          partyName: invite.party.name,
          partySlug: invite.party.slug,
          status: invite.status
        })),
      party,
      team
    };
  }

  async inviteFriend(
    slug: string,
    input: CreatePartyInviteDto,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyInviteDto> {
    const party = await this.requireOwnerParty(slug, currentUser.id);
    const areFriends = await this.friendshipsRepository.areFriends(currentUser.id, input.userId);

    if (!areFriends) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "You can only invite accepted friends",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    if (input.userId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot invite yourself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const memberCount = await this.gamePartiesRepository.countMembers(party.id);

    if (memberCount >= party.maxMembers) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "This team is already full",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const alreadyMember = party.members.some((member) => member.userId === input.userId);

    if (alreadyMember) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "User is already on this team",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const otherMembership =
      await this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
        input.userId,
        DOTA_PARTY_VERTICAL,
        party.kind
      );

    if (otherMembership) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message:
          party.kind === "PARTY"
            ? "User already belongs to an active Dota party"
            : "User already belongs to a Dota team",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const existingInvite = await this.gamePartiesRepository.findPendingInvite(party.id, input.userId);

    if (existingInvite) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Invite already pending",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const invitee = await this.usersRepository.findById(input.userId);

    if (!invitee) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const invite = await this.gamePartiesRepository.createInvite({
      inviteeUserId: input.userId,
      inviterUserId: currentUser.id,
      partyId: party.id
    });

    return {
      createdAt: invite.createdAt.toISOString(),
      expiresAt: party.expiresAt?.toISOString() ?? null,
      id: invite.id,
      inviteeDisplayName: invitee.displayName,
      inviteeUserId: invitee.id,
      kind: party.kind,
      partyName: party.name,
      partySlug: party.slug,
      status: invite.status
    };
  }

  async acceptInvite(inviteId: string, currentUser: AuthenticatedUser): Promise<GamePartyResponseDto> {
    const invite = await this.gamePartiesRepository.findInviteById(inviteId);

    if (!invite || invite.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Invite was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (invite.inviteeUserId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the invitee can accept this invite",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const party = await this.gamePartiesRepository.findById(invite.partyId);

    if (!party || this.isExpired(party)) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    await this.assertNoActiveMembershipOfKind(currentUser.id, party.kind);

    if (party.members.length >= party.maxMembers) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "This team is already full",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const joined = await this.gamePartiesRepository.acceptInviteAtomically({
      inviteId: invite.id,
      maxMembers: party.maxMembers,
      partyId: party.id,
      userId: currentUser.id
    });

    if (!joined) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "This team is already full",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const updated = await this.gamePartiesRepository.findById(party.id);

    if (!updated) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.toPartyResponse(updated, currentUser.id);
  }

  async declineInvite(inviteId: string, currentUser: AuthenticatedUser): Promise<{ ok: true }> {
    const invite = await this.gamePartiesRepository.findInviteById(inviteId);

    if (!invite || invite.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Invite was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (invite.inviteeUserId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the invitee can decline this invite",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    await this.gamePartiesRepository.updateInviteStatus(invite.id, "DECLINED");
    return { ok: true };
  }

  async leaveParty(slug: string, currentUser: AuthenticatedUser): Promise<{ ok: true }> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const membership = party.members.find((member) => member.userId === currentUser.id);

    if (!membership) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "You are not on this team",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (membership.role === "OWNER") {
      if (party.members.length > 1) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Owner can leave only after other members leave, or delete the team",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      await this.gamePartiesRepository.deleteParty(party.id);
      return { ok: true };
    }

    await this.gamePartiesRepository.removeMember(party.id, currentUser.id);
    return { ok: true };
  }

  async listChatMessages(
    slug: string,
    currentUser: AuthenticatedUser,
    before?: string,
    limit?: number
  ): Promise<GamePartyChatMessagesPageDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);
    const rows = await this.gamePartiesRepository.listChatMessages(party.id, before, limit);
    const chronological = [...rows].reverse();
    const pageSize = limit ?? 50;
    const oldestLoaded = rows.at(-1);

    return {
      messages: chronological.map((row) => this.toChatMessageDto(row)),
      nextCursor: rows.length >= Math.min(pageSize, 100) && oldestLoaded ? oldestLoaded.id : null
    };
  }

  async sendChatMessage(
    slug: string,
    message: string,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyChatMessageDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);
    const trimmed = message.trim();

    if (trimmed.length < 1) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Message cannot be empty",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    await this.chatRateLimiterService.assertCanSendMessage(currentUser.id);

    const created = await this.gamePartiesRepository.createChatMessage({
      message: trimmed,
      partyId: party.id,
      userId: currentUser.id
    });

    return this.toChatMessageDto(created);
  }

  private async loadPartyResponse(
    partyId: string,
    viewerUserId: string
  ): Promise<GamePartyResponseDto | null> {
    const full = await this.gamePartiesRepository.findById(partyId);

    if (!full || this.isExpired(full)) {
      return null;
    }

    return this.toPartyResponse(full, viewerUserId);
  }

  private async assertNoActiveMembershipOfKind(userId: string, kind: GamePartyKind): Promise<void> {
    const existing = await this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
      userId,
      DOTA_PARTY_VERTICAL,
      kind
    );

    if (!existing) {
      return;
    }

    throw createAppException({
      code: AppErrorCode.Conflict,
      message:
        kind === "PARTY"
          ? "You already belong to an active Dota party"
          : "You already belong to a Dota team",
      statusCode: HttpStatus.CONFLICT
    });
  }

  private async requireOwnerParty(slug: string, userId: string) {
    const party = await this.requireMemberParty(slug, userId);

    if (party.ownerUserId !== userId) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the team owner can invite friends",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return party;
  }

  private async requireMemberParty(slug: string, userId: string) {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party || this.isExpired(party)) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const isMember = party.members.some((member) => member.userId === userId);

    if (!isMember) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only team members can do this",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return party;
  }

  private isExpired(party: { expiresAt: Date | null; kind: GamePartyKind }): boolean {
    return party.kind === "PARTY" && party.expiresAt !== null && party.expiresAt.getTime() <= Date.now();
  }

  private toChatMessageDto(row: {
    createdAt: Date;
    id: string;
    message: string;
    user: { displayName: string; id: string };
    userId: string;
  }): GamePartyChatMessageDto {
    return {
      createdAt: row.createdAt.toISOString(),
      displayName: row.user.displayName,
      id: row.id,
      message: row.message,
      userId: row.userId
    };
  }

  private async toPartyResponse(
    party: NonNullable<Awaited<ReturnType<GamePartiesRepository["findById"]>>>,
    viewerUserId?: string
  ): Promise<GamePartyResponseDto> {
    const members: GamePartyMemberDto[] = await Promise.all(
      [...party.members]
        .sort((left, right) => {
          if (left.role === right.role) {
            return left.joinedAt.getTime() - right.joinedAt.getTime();
          }

          return left.role === "OWNER" ? -1 : 1;
        })
        .map(async (member) => {
          const dotaEntity = await this.entitiesRepository.findByOwnerUserId(member.userId);
          const attributes = dotaEntity
            ? await this.entityAttributesRepository.findByEntityId(dotaEntity.id)
            : {};

          return {
            displayName: member.user.displayName,
            dotaSlug: dotaEntity?.slug ?? null,
            mmr: attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
            role: member.role,
            userId: member.userId
          };
        })
    );

    return {
      expiresAt: party.expiresAt?.toISOString() ?? null,
      id: party.id,
      isMember: viewerUserId
        ? party.members.some((member) => member.userId === viewerUserId)
        : false,
      isOwner: viewerUserId === party.ownerUserId,
      kind: party.kind,
      maxMembers: party.maxMembers,
      memberCount: members.length,
      members,
      name: party.name,
      openSlots: Math.max(0, party.maxMembers - members.length),
      ownerUserId: party.ownerUserId,
      slug: party.slug,
      vertical: party.vertical,
      visibility: party.visibility
    };
  }

  private async createAvailableSlug(baseSlug: string, kind: GamePartyKind): Promise<string> {
    const prefix = kind === "PARTY" ? "party-" : "";
    const normalizedBase = `${prefix}${baseSlug}`.slice(0, 120) || `team-${Date.now().toString(36)}`;

    for (let index = 0; index < 10; index += 1) {
      const candidate = index === 0 ? normalizedBase : `${normalizedBase}-${index + 1}`.slice(0, 120);
      const existing = await this.gamePartiesRepository.findSlug(DOTA_PARTY_VERTICAL, candidate);

      if (!existing) {
        return candidate;
      }
    }

    return `${normalizedBase.slice(0, 111)}-${Date.now().toString(36)}`;
  }
}
