import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_PARTY_INVITE_TTL_HOURS,
  DOTA_PARTY_SIZE,
  DOTA_PARTY_VERTICAL,
  DOTA_TEMP_PARTY_TTL_HOURS,
  DOTA_VERTICAL,
  generateDotaPartyName,
  isDotaGreenFlagKey,
  isDotaPositionRole,
  isDotaRedFlagKey,
  type DotaPositionRole,
  type GamePartyKind
} from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtTokenService } from "../../auth/services/jwt-token.service.js";
import { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import { createSlug } from "../../entities/services/entity-slug.js";
import { EntityAttributesRepository } from "../../dota/repositories/entity-attributes.repository.js";
import { EntityQualityConfirmationsRepository } from "../../dota/repositories/entity-quality-confirmations.repository.js";
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
import {
  PARTY_REALTIME_PUBLISHER,
  type PartyRealtimePublisher
} from "../party-realtime.types.js";

const INVITE_FLAG_LIMIT = 3;
const PARTY_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const TERMINAL_INVITE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = DOTA_PARTY_INVITE_TTL_HOURS * 60 * 60 * 1000;


@Injectable()
export class GamePartiesService implements OnModuleInit {
  private readonly logger = new Logger(GamePartiesService.name);

  constructor(
    private readonly entityAttributesRepository: EntityAttributesRepository,
    private readonly entityQualityConfirmationsRepository: EntityQualityConfirmationsRepository,
    private readonly entitiesRepository: EntitiesRepository,
    private readonly friendshipsRepository: FriendshipsRepository,
    private readonly gamePartiesRepository: GamePartiesRepository,
    private readonly jwtTokenService: JwtTokenService,
    @Inject(PARTY_REALTIME_PUBLISHER)
    private readonly partyRealtimeService: PartyRealtimePublisher,
    private readonly usersRepository: UsersRepository
  ) {}

  onModuleInit(): void {
    void this.runCleanupSafely();

    setInterval(() => {
      void this.runCleanupSafely();
    }, PARTY_CLEANUP_INTERVAL_MS).unref();
  }

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

    if (kind === "PARTY") {
      await this.clearLookingForUser(currentUser.id);
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

    if (!this.isPartyManager(party, currentUser.id)) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain or a sub-captain can rename this team",
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

    if (!party) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (this.isExpired(party)) {
      await this.purgeExpiredParty(party);
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.toPartyResponse(party, viewerUserId);
  }

  async getMyParties(currentUser: AuthenticatedUser): Promise<MyPartiesResponseDto> {
    const [teamMembership, partyMemberships, invites, outgoing] = await Promise.all([
      this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
        currentUser.id,
        DOTA_PARTY_VERTICAL,
        "TEAM"
      ),
      this.gamePartiesRepository.findActiveMembershipsForUserInVerticalByKind(
        currentUser.id,
        DOTA_PARTY_VERTICAL,
        "PARTY"
      ),
      this.gamePartiesRepository.listIncomingInvitesForUser(currentUser.id),
      this.gamePartiesRepository.listOutgoingInvitesForUser(currentUser.id)
    ]);

    const team = teamMembership
      ? await this.loadPartyResponse(teamMembership.partyId, currentUser.id)
      : null;

    const parties = (
      await Promise.all(
        partyMemberships.map((membership) =>
          this.loadPartyResponse(membership.partyId, currentUser.id)
        )
      )
    ).filter((party): party is GamePartyResponseDto => party !== null);

    const now = Date.now();
    const inviteTtlCutoff = now - INVITE_TTL_MS;
    const liveInvites = [];
    const inviteeUserIds = [
      ...new Set([
        ...invites.map((invite) => invite.inviteeUserId),
        ...outgoing.map((invite) => invite.inviteeUserId)
      ])
    ];
    const inviteeMeta = await this.loadInviteeMeta(inviteeUserIds);

    for (const invite of invites) {
      const partyExpired =
        invite.party.kind === "PARTY" &&
        invite.party.expiresAt !== null &&
        invite.party.expiresAt.getTime() <= now;
      const full = invite.party._count.members >= invite.party.maxMembers;
      const inviteStale =
        invite.status === "PENDING" && invite.createdAt.getTime() < inviteTtlCutoff;

      if (invite.status === "PENDING" && (partyExpired || full || inviteStale)) {
        await this.gamePartiesRepository.updateInviteStatus(invite.id, "CANCELLED");
        if (partyExpired) {
          await this.purgeExpiredParty(invite.party);
        }
        continue;
      }

      liveInvites.push(
        this.toInviteDto(invite, "incoming", invite.party, inviteeMeta[invite.inviteeUserId])
      );
    }

    const outgoingInvites = [];

    for (const invite of outgoing) {
      const partyExpired =
        invite.party.kind === "PARTY" &&
        invite.party.expiresAt !== null &&
        invite.party.expiresAt.getTime() <= now;
      const full = invite.party._count.members >= invite.party.maxMembers;
      const inviteStale =
        invite.status === "PENDING" && invite.createdAt.getTime() < inviteTtlCutoff;

      if (invite.status === "PENDING" && (partyExpired || full || inviteStale)) {
        await this.gamePartiesRepository.updateInviteStatus(invite.id, "CANCELLED");
        if (partyExpired) {
          await this.purgeExpiredParty(invite.party);
        }
        continue;
      }

      if (partyExpired && invite.status !== "PENDING") {
        await this.purgeExpiredParty(invite.party);
        continue;
      }

      outgoingInvites.push(
        this.toInviteDto(invite, "outgoing", invite.party, inviteeMeta[invite.inviteeUserId])
      );
    }

    const managedPartyIds = [team, ...parties]
      .filter((party): party is GamePartyResponseDto => Boolean(party?.isOfficer && !party.isOwner))
      .map((party) => party.id);

    if (managedPartyIds.length > 0) {
      const officerApps =
        await this.gamePartiesRepository.listPendingApplicationsForParties(managedPartyIds);
      const knownIds = new Set(outgoingInvites.map((invite) => invite.id));
      const appMeta = await this.loadInviteeMeta([
        ...new Set(officerApps.map((invite) => invite.inviteeUserId))
      ]);

      for (const invite of officerApps) {
        if (knownIds.has(invite.id)) {
          continue;
        }

        outgoingInvites.push(
          this.toInviteDto(
            invite,
            "outgoing",
            invite.party,
            appMeta[invite.inviteeUserId] ?? inviteeMeta[invite.inviteeUserId]
          )
        );
      }
    }

    return {
      invites: liveInvites,
      outgoingInvites,
      parties,
      party: parties[0] ?? null,
      team
    };
  }

  async inviteFriend(
    slug: string,
    input: CreatePartyInviteDto,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyInviteDto> {
    const party = await this.requireManagerParty(slug, currentUser.id);
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

    if (party.kind === "TEAM") {
      const otherMembership =
        await this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
          input.userId,
          DOTA_PARTY_VERTICAL,
          "TEAM"
        );

      if (otherMembership) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "User already belongs to a Dota team",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    const existingInvite = await this.gamePartiesRepository.findPendingInvite(party.id, input.userId);

    if (existingInvite) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Invite already pending",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const positionRole =
      input.positionRole && isDotaPositionRole(input.positionRole) ? input.positionRole : null;

    if (positionRole) {
      const taken = party.members.some((member) => member.positionRole === positionRole);

      if (taken) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }
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
      partyId: party.id,
      positionRole
    });

    const meta = await this.loadInviteeMeta([invitee.id]);

    return this.toInviteDto(
      {
        ...invite,
        invitee: { displayName: invitee.displayName, id: invitee.id }
      },
      "outgoing",
      party,
      meta[invitee.id]
    );
  }

  async acceptInvite(
    inviteId: string,
    currentUser: AuthenticatedUser
  ): Promise<{
    inviteKind: "INVITE" | "APPLICATION";
    inviteeUserId: string;
    inviterUserId: string;
    notifyInvite: GamePartyInviteDto;
    party: GamePartyResponseDto;
  }> {
    const invite = await this.gamePartiesRepository.findInviteById(inviteId);

    if (!invite || invite.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Invite was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const party = await this.gamePartiesRepository.findById(invite.partyId);

    if (!party || this.isExpired(party)) {
      if (invite.status === "PENDING") {
        await this.gamePartiesRepository.updateInviteStatus(invite.id, "CANCELLED");
      }

      if (party && this.isExpired(party)) {
        await this.purgeExpiredParty(party);
      }

      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const isApplication = invite.kind === "APPLICATION";
    const isInvitee = invite.inviteeUserId === currentUser.id;
    const isManager = this.isPartyManager(party, currentUser.id);

    if (isApplication) {
      if (!isManager) {
        throw createAppException({
          code: AppErrorCode.Forbidden,
          message: "Only the captain or a sub-captain can accept this application",
          statusCode: HttpStatus.FORBIDDEN
        });
      }
    } else if (!isInvitee) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the invitee can accept this invite",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const joiningUserId = invite.inviteeUserId;
    await this.assertNoActiveMembershipOfKind(joiningUserId, party.kind);

    if (party.members.length >= party.maxMembers) {
      const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(party.id);
      await this.emitAutoClosedNotifications(closed, party);
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This team is already full",
        statusCode: HttpStatus.CONFLICT
      });
    }

    if (invite.positionRole) {
      const taken = party.members.some((member) => member.positionRole === invite.positionRole);

      if (taken) {
        const closed = await this.gamePartiesRepository.closePendingInvitesForPosition(
          party.id,
          invite.positionRole,
          { status: "CANCELLED" }
        );
        await this.emitAutoClosedNotifications(closed, party);
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    const { closedInvites, member: joined } = await this.gamePartiesRepository.acceptInviteAtomically({
      inviteId: invite.id,
      maxMembers: party.maxMembers,
      partyId: party.id,
      positionRole: invite.positionRole,
      userId: joiningUserId
    });

    if (!joined) {
      // Role/full race: closedInvites already collected inside the transaction.
      await this.emitAutoClosedNotifications(closedInvites, party);
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: invite.positionRole ? "This role is already taken" : "This team is already full",
        statusCode: HttpStatus.CONFLICT
      });
    }

    await this.clearLookingForUser(joiningUserId);
    await this.refreshRecruitLookingAttributes(party.ownerUserId, party.id);

    const updated = await this.gamePartiesRepository.findById(party.id);

    if (!updated) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    let extraClosed: typeof closedInvites = [];

    if (updated.members.length >= updated.maxMembers) {
      extraClosed = await this.gamePartiesRepository.cancelPendingInvitesForParty(updated.id);
      await this.clearLookingForUser(updated.ownerUserId);
    }

    const closedById = new Map(
      [...closedInvites, ...extraClosed].map((row) => [row.id, row] as const)
    );
    await this.emitAutoClosedNotifications([...closedById.values()], party);

    const inviteeMeta = await this.loadInviteeMeta([invite.inviteeUserId]);
    const invitee = await this.usersRepository.findById(invite.inviteeUserId);
    const notifyInvite = this.toInviteDto(
      {
        ...invite,
        invitee: {
          displayName: invitee?.displayName ?? "Player",
          id: invite.inviteeUserId
        },
        status: "ACCEPTED"
      },
      isApplication ? "incoming" : "outgoing",
      party,
      inviteeMeta[invite.inviteeUserId]
    );

    return {
      inviteKind: invite.kind === "APPLICATION" ? "APPLICATION" : "INVITE",
      inviteeUserId: invite.inviteeUserId,
      inviterUserId: invite.inviterUserId,
      notifyInvite,
      party: await this.toPartyResponse(updated, currentUser.id)
    };
  }

  async declineInvite(
    inviteId: string,
    currentUser: AuthenticatedUser
  ): Promise<{
    inviteKind: "INVITE" | "APPLICATION";
    inviteeUserId: string;
    inviterUserId: string;
    managerUserIds: string[];
    notifyInvite: GamePartyInviteDto;
    ok: true;
  }> {
    const invite = await this.gamePartiesRepository.findInviteById(inviteId);

    if (!invite || invite.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Invite was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const party = await this.gamePartiesRepository.findById(invite.partyId);
    const isInvitee = invite.inviteeUserId === currentUser.id;
    const isManager = party ? this.isPartyManager(party, currentUser.id) : false;
    const isApplication = invite.kind === "APPLICATION";

    if (isApplication) {
      if (!isInvitee && !isManager) {
        throw createAppException({
          code: AppErrorCode.Forbidden,
          message: "Only the captain, a sub-captain, or the applicant can decline this application",
          statusCode: HttpStatus.FORBIDDEN
        });
      }
    } else if (!isInvitee) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the invitee can decline this invite",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    await this.gamePartiesRepository.updateInviteStatus(invite.id, "DECLINED");

    const inviteeMeta = await this.loadInviteeMeta([invite.inviteeUserId]);
    const invitee = await this.usersRepository.findById(invite.inviteeUserId);
    const partyForDto = party ?? {
      expiresAt: null,
      kind: "PARTY" as const,
      name: "Party",
      slug: ""
    };

    const notifyInvite = this.toInviteDto(
      {
        ...invite,
        invitee: {
          displayName: invitee?.displayName ?? "Player",
          id: invite.inviteeUserId
        },
        status: "DECLINED"
      },
      isApplication ? "incoming" : "outgoing",
      partyForDto,
      inviteeMeta[invite.inviteeUserId]
    );

    return {
      inviteKind: isApplication ? "APPLICATION" : "INVITE",
      inviteeUserId: invite.inviteeUserId,
      inviterUserId: invite.inviterUserId,
      managerUserIds: party
        ? [
            party.ownerUserId,
            ...party.members
              .filter((member) => member.role === "OFFICER")
              .map((member) => member.userId)
          ].filter((userId, index, all) => all.indexOf(userId) === index)
        : [invite.inviterUserId],
      notifyInvite,
      ok: true
    };
  }

  async stackInvite(
    targetSlug: string,
    currentUser: AuthenticatedUser,
    fromPartySlug?: string,
    positionRole?: string
  ): Promise<{ invite: GamePartyInviteDto; party: GamePartyResponseDto }> {
    const targetEntity = await this.entitiesRepository.findBySlug(targetSlug);

    if (!targetEntity?.ownerUserId || targetEntity.type !== "person") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Player was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const targetAttributes = await this.entityAttributesRepository.findByEntityId(targetEntity.id);

    if (targetAttributes[DOTA_ATTRIBUTE_KEYS.vertical] !== DOTA_PARTY_VERTICAL) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Player was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const targetUserId = targetEntity.ownerUserId;

    if (targetUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot stack with yourself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const lfgUntil = targetAttributes[DOTA_ATTRIBUTE_KEYS.lfgUntil];
    const lfgMs = lfgUntil ? Date.parse(lfgUntil) : Number.NaN;

    if (!Number.isFinite(lfgMs) || lfgMs <= Date.now()) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Player is not looking for a party right now",
        statusCode: HttpStatus.CONFLICT
      });
    }

    let partyResponse: GamePartyResponseDto;
    let invite: GamePartyInviteDto;
    let inviteDirection: "incoming" | "outgoing" = "outgoing";
    const resolvedPosition =
      positionRole && isDotaPositionRole(positionRole) ? positionRole : null;

    const recruitSlug = targetAttributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim();

    if (recruitSlug) {
      if (!resolvedPosition) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Pick a role to apply for",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      const recruitParty = await this.gamePartiesRepository.findByVerticalAndSlug(
        DOTA_PARTY_VERTICAL,
        recruitSlug
      );

      if (!recruitParty || recruitParty.ownerUserId !== targetUserId || this.isExpired(recruitParty)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Player is no longer recruiting for a party",
          statusCode: HttpStatus.CONFLICT
        });
      }

      const recruitedRoles = parseRecruitedRoles(
        targetAttributes[DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]
      );
      const claimedRoles = new Set(
        recruitParty.members
          .map((member) => member.positionRole)
          .filter((role): role is string => Boolean(role))
      );

      if (!recruitedRoles.includes(resolvedPosition) || claimedRoles.has(resolvedPosition)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is not open on that party",
          statusCode: HttpStatus.CONFLICT
        });
      }

      invite = await this.inviteWithoutFriendshipCheck(
        recruitSlug,
        currentUser.id,
        { id: targetUserId } as AuthenticatedUser,
        {
          inviteKind: "APPLICATION",
          positionRole: resolvedPosition
        }
      );
      inviteDirection = "incoming";
      const loaded = await this.loadPartyResponse(recruitParty.id, currentUser.id);

      if (!loaded) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      partyResponse = loaded;
      await this.clearLookingForUser(currentUser.id);
    } else if (fromPartySlug) {
      const owned = await this.requireManagerParty(fromPartySlug, currentUser.id);
      const loaded = await this.loadPartyResponse(owned.id, currentUser.id);

      if (!loaded) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      partyResponse = loaded;

      if (resolvedPosition) {
        const claimed = partyResponse.members.some(
          (member) => member.positionRole === resolvedPosition
        );

        if (claimed) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This role is already taken",
            statusCode: HttpStatus.CONFLICT
          });
        }
      }

      invite = await this.inviteWithoutFriendshipCheck(
        partyResponse.slug,
        targetUserId,
        currentUser,
        {
          inviteKind: "INVITE",
          positionRole: resolvedPosition
        }
      );
      await this.refreshRecruitLookingAttributes(owned.ownerUserId, owned.id);
    } else {
      partyResponse = await this.createParty({ kind: "PARTY" }, currentUser);
      invite = await this.inviteWithoutFriendshipCheck(
        partyResponse.slug,
        targetUserId,
        currentUser,
        {
          inviteKind: "INVITE",
          positionRole: resolvedPosition
        }
      );
    }

    return {
      invite: {
        ...invite,
        direction: inviteDirection
      },
      party: partyResponse
    };
  }

  async createJoinToken(
    slug: string,
    currentUser: AuthenticatedUser
  ): Promise<{ token: string }> {
    const party = await this.requireMemberParty(slug, currentUser.id);

    return {
      token: this.jwtTokenService.signPartyJoinToken(party.id, party.slug)
    };
  }

  async joinByToken(
    token: string,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const verified = this.jwtTokenService.verifyPartyJoinToken(token);

    if (!verified) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Join link is invalid or expired",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const party = await this.gamePartiesRepository.findById(verified.partyId);

    if (!party || party.slug !== verified.slug) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (this.isExpired(party)) {
      await this.purgeExpiredParty(party);
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const alreadyMember = party.members.some((member) => member.userId === currentUser.id);

    if (alreadyMember) {
      return this.toPartyResponse(party, currentUser.id);
    }

    await this.assertNoActiveMembershipOfKind(currentUser.id, party.kind);

    if (party.members.length >= party.maxMembers) {
      const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(party.id);
      await this.emitAutoClosedNotifications(closed, party);
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This team is already full",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const joined = await this.gamePartiesRepository.addMemberAtomically({
      maxMembers: party.maxMembers,
      partyId: party.id,
      userId: currentUser.id
    });

    if (!joined) {
      const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(party.id);
      await this.emitAutoClosedNotifications(closed, party);
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This team is already full",
        statusCode: HttpStatus.CONFLICT
      });
    }

    if (party.kind === "PARTY") {
      await this.clearLookingForUser(currentUser.id);
    }

    const updated = await this.gamePartiesRepository.findById(party.id);

    if (!updated) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (updated.members.length >= updated.maxMembers) {
      const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(updated.id);
      await this.emitAutoClosedNotifications(closed, updated);
    }

    await this.refreshRecruitLookingAttributes(updated.ownerUserId, updated.id);

    return this.toPartyResponse(updated, currentUser.id);
  }

  private async inviteWithoutFriendshipCheck(
    slug: string,
    targetUserId: string,
    currentUser: AuthenticatedUser,
    options?: {
      inviteKind?: "INVITE" | "APPLICATION";
      positionRole?: DotaPositionRole | null;
    }
  ): Promise<GamePartyInviteDto> {
    const party = await this.requireManagerParty(slug, currentUser.id);

    if (targetUserId === currentUser.id) {
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

    const alreadyMember = party.members.some((member) => member.userId === targetUserId);

    if (alreadyMember) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "User is already on this team",
        statusCode: HttpStatus.CONFLICT
      });
    }

    if (party.kind === "TEAM") {
      const otherMembership =
        await this.gamePartiesRepository.findActiveMembershipForUserInVerticalByKind(
          targetUserId,
          DOTA_PARTY_VERTICAL,
          "TEAM"
        );

      if (otherMembership) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "User already belongs to a Dota team",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    const existingInvite = await this.gamePartiesRepository.findPendingInvite(party.id, targetUserId);

    if (existingInvite) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Invite already pending",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const positionRole = options?.positionRole ?? null;

    if (positionRole) {
      const taken = party.members.some((member) => member.positionRole === positionRole);

      if (taken) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    const invitee = await this.usersRepository.findById(targetUserId);

    if (!invitee) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const invite = await this.gamePartiesRepository.createInvite({
      inviteeUserId: targetUserId,
      inviteKind: options?.inviteKind ?? "INVITE",
      inviterUserId: currentUser.id,
      partyId: party.id,
      positionRole
    });

    const meta = await this.loadInviteeMeta([invitee.id]);

    return this.toInviteDto(
      {
        ...invite,
        invitee: { displayName: invitee.displayName, id: invitee.id }
      },
      "outgoing",
      party,
      meta[invitee.id]
    );
  }

  async updateMyPosition(
    slug: string,
    positionRole: DotaPositionRole | null,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);

    if (positionRole) {
      const taken = party.members.some(
        (member) => member.positionRole === positionRole && member.userId !== currentUser.id
      );

      if (taken) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    try {
      await this.gamePartiesRepository.updateMemberPositionRole(
        party.id,
        currentUser.id,
        positionRole
      );
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }

    if (positionRole) {
      const closed = await this.gamePartiesRepository.closePendingInvitesForPosition(
        party.id,
        positionRole,
        { status: "DECLINED" }
      );
      await this.emitAutoClosedNotifications(closed, party);
    }

    await this.refreshRecruitLookingAttributes(party.ownerUserId, party.id);
    return this.getPartyBySlug(slug, currentUser.id);
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
      if (this.isExpired(party)) {
        await this.purgeExpiredParty(party);
        return { ok: true };
      }

      if (party.members.length > 1) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Owner can leave only after other members leave, or delete the team",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      await this.gamePartiesRepository.deleteParty(party.id);
      await this.clearLookingForUser(currentUser.id);
      return { ok: true };
    }

    await this.gamePartiesRepository.removeMember(party.id, currentUser.id);

    if (!this.isExpired(party)) {
      await this.refreshRecruitLookingAttributes(party.ownerUserId, party.id);
    }

    return { ok: true };
  }

  async disbandParty(slug: string, currentUser: AuthenticatedUser): Promise<{ ok: true }> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (party.ownerUserId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain can disband this team",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    if (this.isExpired(party)) {
      await this.purgeExpiredParty(party);
      return { ok: true };
    }

    const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(party.id);
    await this.emitAutoClosedNotifications(closed, party);
    await this.gamePartiesRepository.deleteParty(party.id);
    await this.clearLookingForUser(currentUser.id);
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

    const created = await this.gamePartiesRepository.createChatMessage({
      message: trimmed,
      partyId: party.id,
      userId: currentUser.id
    });

    return this.toChatMessageDto(created);
  }

  async kickMember(
    slug: string,
    targetUserId: string,
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

    if (!this.isPartyManager(party, currentUser.id)) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain or a sub-captain can kick members",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    if (targetUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot kick yourself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const membership = party.members.find((member) => member.userId === targetUserId);

    if (!membership) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Player is not on this team",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (membership.role === "OWNER") {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Cannot kick the captain",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    // Sub-captains cannot remove other officers; only the captain can.
    if (membership.role === "OFFICER" && party.ownerUserId !== currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain can remove a sub-captain",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    await this.gamePartiesRepository.removeMember(party.id, targetUserId);
    await this.refreshRecruitLookingAttributes(party.ownerUserId, party.id);
    return this.getPartyBySlug(slug, currentUser.id);
  }

  async updateMemberRole(
    slug: string,
    targetUserId: string,
    role: "OFFICER" | "MEMBER",
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const party = await this.requireOwnerParty(slug, currentUser.id);

    if (targetUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Captain cannot change their own role",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const membership = party.members.find((member) => member.userId === targetUserId);

    if (!membership) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Player is not on this team",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (membership.role === "OWNER" || membership.userId === party.ownerUserId) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Cannot change the captain role",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    await this.gamePartiesRepository.updateMemberRole(party.id, targetUserId, role);
    return this.getPartyBySlug(slug, currentUser.id);
  }

  private async loadPartyResponse(
    partyId: string,
    viewerUserId: string
  ): Promise<GamePartyResponseDto | null> {
    const full = await this.gamePartiesRepository.findById(partyId);

    if (!full) {
      return null;
    }

    if (this.isExpired(full)) {
      await this.purgeExpiredParty(full);
      return null;
    }

    return this.toPartyResponse(full, viewerUserId);
  }

  private async purgeExpiredParty(party: {
    expiresAt: Date | null;
    id: string;
    kind: GamePartyKind;
    ownerUserId: string;
  }): Promise<void> {
    if (!this.isExpired(party)) {
      return;
    }

    try {
      await this.gamePartiesRepository.deleteParty(party.id);
    } catch (error) {
      if (isPrismaErrorCode(error, "P2025")) {
        // Already deleted concurrently.
      } else {
        throw error;
      }
    }

    await this.clearLookingForUser(party.ownerUserId);
  }

  private async runCleanupSafely(): Promise<void> {
    try {
      const expired = await this.gamePartiesRepository.deleteExpiredParties();

      for (const party of expired) {
        await this.clearLookingForUser(party.ownerUserId);
      }

      const stalePending = await this.gamePartiesRepository.cancelStalePendingInvites(
        new Date(Date.now() - INVITE_TTL_MS)
      );

      const staleInvites = await this.gamePartiesRepository.deleteStaleTerminalInvites(
        new Date(Date.now() - TERMINAL_INVITE_RETENTION_MS)
      );

      if (expired.length > 0 || stalePending > 0 || staleInvites > 0) {
        this.logger.log(
          `Party cleanup removed ${expired.length} expired parties, cancelled ${stalePending} stale pending invites, and deleted ${staleInvites} terminal invites`
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : "Unknown party cleanup error",
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  private async assertNoActiveMembershipOfKind(userId: string, kind: GamePartyKind): Promise<void> {
    // Temporary parties are multi-membership; persistent teams stay unique.
    if (kind === "PARTY") {
      return;
    }

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
      message: "You already belong to a Dota team",
      statusCode: HttpStatus.CONFLICT
    });
  }

  private async clearLookingForUser(userId: string): Promise<void> {
    const entity = await this.entitiesRepository.findByOwnerUserId(userId);

    if (!entity) {
      return;
    }

    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    if (attributes[DOTA_ATTRIBUTE_KEYS.vertical] !== DOTA_VERTICAL) {
      return;
    }

    const partySlug = attributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim() || "";

    await this.entityAttributesRepository.upsertMany(entity.id, {
      [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgUntil]: new Date(0).toISOString()
    });

    if (partySlug) {
      const party = await this.gamePartiesRepository.findByVerticalAndSlug(
        DOTA_PARTY_VERTICAL,
        partySlug
      );
      this.partyRealtimeService.broadcastPartyRecruitUpdated({
        looking: false,
        ...(party?.id ? { partyId: party.id } : {}),
        partySlug,
        recruitedRoles: []
      });
    }
  }

  private async refreshRecruitLookingAttributes(ownerUserId: string, partyId: string): Promise<void> {
    const entity = await this.entitiesRepository.findByOwnerUserId(ownerUserId);

    if (!entity) {
      return;
    }

    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);
    const lfgUntil = attributes[DOTA_ATTRIBUTE_KEYS.lfgUntil];
    const lfgMs = lfgUntil ? Date.parse(lfgUntil) : Number.NaN;

    if (!Number.isFinite(lfgMs) || lfgMs <= Date.now()) {
      return;
    }

    if (attributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim() === "") {
      return;
    }

    const party = await this.gamePartiesRepository.findById(partyId);

    if (!party || this.isExpired(party)) {
      await this.clearLookingForUser(ownerUserId);
      return;
    }

    const recruitedRoles = parseRecruitedRoles(attributes[DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]);
    const claimed = new Set(
      party.members
        .map((member) => member.positionRole)
        .filter((role): role is string => Boolean(role))
    );
    // Keep the captain's desired role set; open slots are filtered when listing LFG.
    // Shrinking here made kicked roles fail to reopen without clicking Find again.
    const openRoles = recruitedRoles.filter((role) => !claimed.has(role));
    const desiredSize = Math.min(party.maxMembers, party.members.length + openRoles.length);

    await this.entityAttributesRepository.upsertMany(entity.id, {
      [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: String(desiredSize),
      [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: String(party.members.length)
    });

    if (openRoles.length === 0 || party.members.length >= party.maxMembers) {
      await this.clearLookingForUser(ownerUserId);
      return;
    }

    this.partyRealtimeService.broadcastPartyRecruitUpdated({
      looking: true,
      partyId: party.id,
      partySlug: party.slug,
      recruitedRoles: openRoles
    });
  }

  private async requireOwnerParty(slug: string, userId: string) {
    const party = await this.requireMemberParty(slug, userId);

    if (party.ownerUserId !== userId) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the team captain can do this",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return party;
  }

  private async requireManagerParty(slug: string, userId: string) {
    const party = await this.requireMemberParty(slug, userId);

    if (!this.isPartyManager(party, userId)) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain or a sub-captain can do this",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return party;
  }

  private isPartyManager(
    party: {
      members: Array<{ role: string; userId: string }>;
      ownerUserId: string;
    },
    userId: string
  ): boolean {
    if (party.ownerUserId === userId) {
      return true;
    }

    return party.members.some(
      (member) => member.userId === userId && member.role === "OFFICER"
    );
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
          const rank = (role: string) =>
            role === "OWNER" ? 0 : role === "OFFICER" ? 1 : 2;
          const rankDelta = rank(left.role) - rank(right.role);

          if (rankDelta !== 0) {
            return rankDelta;
          }

          return left.joinedAt.getTime() - right.joinedAt.getTime();
        })
        .map(async (member) => {
          const dotaEntity = await this.entitiesRepository.findByOwnerUserId(member.userId);
          const attributes = dotaEntity
            ? await this.entityAttributesRepository.findByEntityId(dotaEntity.id)
            : {};

          return {
            displayName: member.user.displayName,
            dotaAccountId: attributes[DOTA_ATTRIBUTE_KEYS.dotaAccountId]?.trim() || null,
            dotaSlug: dotaEntity?.slug ?? null,
            mmr: attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
            positionRole:
              member.positionRole && isDotaPositionRole(member.positionRole)
                ? member.positionRole
                : null,
            role: member.role,
            userId: member.userId
          };
        })
    );

    const isOwner = viewerUserId === party.ownerUserId;
    const isOfficer = Boolean(
      viewerUserId &&
        party.members.some(
          (member) => member.userId === viewerUserId && member.role === "OFFICER"
        )
    );

    return {
      canManageParty: isOwner || isOfficer,
      expiresAt: party.expiresAt?.toISOString() ?? null,
      id: party.id,
      isMember: viewerUserId
        ? party.members.some((member) => member.userId === viewerUserId)
        : false,
      isOfficer,
      isOwner,
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

  private async emitAutoClosedNotifications(
    closed: Array<{
      createdAt: Date;
      id: string;
      inviteeUserId: string;
      inviterUserId: string;
      kind: "INVITE" | "APPLICATION";
      positionRole: string | null;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
    }>,
    party: {
      expiresAt: Date | null;
      kind: GamePartyKind;
      name: string;
      slug: string;
    }
  ): Promise<void> {
    if (closed.length === 0) {
      return;
    }

    const notifications = await this.toAutoClosedNotifications(closed, party);

    for (const item of notifications) {
      this.partyRealtimeService.emitPartyNotification(item.notifyUserId, {
        invite: item.invite,
        type: "declined"
      });
    }
  }

  private async toAutoClosedNotifications(
    closed: Array<{
      createdAt: Date;
      id: string;
      inviteeUserId: string;
      inviterUserId: string;
      kind: "INVITE" | "APPLICATION";
      positionRole: string | null;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
    }>,
    party: {
      expiresAt: Date | null;
      kind: GamePartyKind;
      name: string;
      slug: string;
    }
  ): Promise<Array<{ invite: GamePartyInviteDto; notifyUserId: string }>> {
    if (closed.length === 0) {
      return [];
    }

    const inviteeIds = [...new Set(closed.map((row) => row.inviteeUserId))];
    const inviteeMeta = await this.loadInviteeMeta(inviteeIds);
    const users = await Promise.all(
      inviteeIds.map(async (userId) => {
        const user = await this.usersRepository.findById(userId);
        return [userId, user?.displayName ?? "Player"] as const;
      })
    );
    const displayNames = Object.fromEntries(users);

    return closed.map((row) => {
      const invite = this.toInviteDto(
        {
          createdAt: row.createdAt,
          id: row.id,
          invitee: {
            displayName: displayNames[row.inviteeUserId] ?? "Player",
            id: row.inviteeUserId
          },
          inviteeUserId: row.inviteeUserId,
          kind: row.kind,
          positionRole: row.positionRole,
          status: row.status === "PENDING" ? "DECLINED" : row.status
        },
        "incoming",
        party,
        inviteeMeta[row.inviteeUserId]
      );

      return {
        invite,
        // Invitee (applicant / invited friend) — captain UI refreshes via party_updated.
        notifyUserId: row.inviteeUserId
      };
    });
  }

  private toInviteDto(
    invite: {
      createdAt: Date;
      id: string;
      invitee: { displayName: string; id: string };
      inviteeUserId: string;
      kind?: "INVITE" | "APPLICATION";
      positionRole?: string | null;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
    },
    direction: "incoming" | "outgoing",
    party: {
      expiresAt: Date | null;
      kind: GamePartyKind;
      name: string;
      slug: string;
    },
    meta?: InviteeMeta
  ): GamePartyInviteDto {
    const positionRole =
      invite.positionRole && isDotaPositionRole(invite.positionRole) ? invite.positionRole : null;

    return {
      createdAt: invite.createdAt.toISOString(),
      direction,
      expiresAt: party.expiresAt?.toISOString() ?? null,
      greenFlags: meta?.greenFlags ?? [],
      id: invite.id,
      inviteeDisplayName: invite.invitee.displayName,
      inviteeDotaSlug: meta?.dotaSlug ?? null,
      inviteeMmr: meta?.mmr ?? null,
      inviteeUserId: invite.inviteeUserId,
      inviteKind: invite.kind ?? "INVITE",
      kind: party.kind,
      partyName: party.name,
      partySlug: party.slug,
      positionRole:
        (invite.positionRole && isDotaPositionRole(invite.positionRole)
          ? invite.positionRole
          : null) as DotaPositionRole | null,
      redFlags: meta?.redFlags ?? [],
      status: invite.status
    };
  }

  private async loadInviteeMeta(userIds: string[]): Promise<Record<string, InviteeMeta>> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const result: Record<string, InviteeMeta> = {};

    if (uniqueIds.length === 0) {
      return result;
    }

    const entityByUser = new Map<string, { id: string; slug: string }>();

    await Promise.all(
      uniqueIds.map(async (userId) => {
        const entity = await this.entitiesRepository.findByOwnerUserId(userId);

        if (entity) {
          entityByUser.set(userId, { id: entity.id, slug: entity.slug });
        }

        result[userId] = {
          dotaSlug: entity?.slug ?? null,
          greenFlags: [],
          mmr: null,
          redFlags: []
        };
      })
    );

    const entityIds = [...entityByUser.values()].map((entity) => entity.id);
    const [qualities, attributesByEntity] = await Promise.all([
      this.entityQualityConfirmationsRepository.countByQualityKeyForEntities(entityIds),
      Promise.all(
        entityIds.map(async (entityId) => {
          const attributes = await this.entityAttributesRepository.findByEntityId(entityId);
          return [entityId, attributes] as const;
        })
      )
    ]);
    const attributeMap = new Map(attributesByEntity);

    for (const [userId, entity] of entityByUser) {
      const counts = qualities[entity.id] ?? {};
      const attributes = attributeMap.get(entity.id) ?? {};
      result[userId] = {
        dotaSlug: entity.slug,
        greenFlags: pickInviteFlags(counts, isDotaGreenFlagKey),
        mmr: attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
        redFlags: pickInviteFlags(counts, isDotaRedFlagKey)
      };
    }

    return result;
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

type InviteeMeta = {
  dotaSlug: string | null;
  greenFlags: Array<{ count: number; key: string }>;
  mmr: string | null;
  redFlags: Array<{ count: number; key: string }>;
};

function parseRecruitedRoles(value: string | undefined): DotaPositionRole[] {
  if (!value?.trim()) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(isDotaPositionRole)
    )
  ];
}

function pickInviteFlags(
  qualities: Record<string, number>,
  matches: (key: string) => boolean
): Array<{ count: number; key: string }> {
  return Object.entries(qualities)
    .filter(([key, count]) => matches(key) && count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, INVITE_FLAG_LIMIT)
    .map(([key, count]) => ({ count, key }));
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
