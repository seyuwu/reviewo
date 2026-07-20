import { HttpStatus, Inject, Injectable, Logger, OnModuleInit, HttpException } from "@nestjs/common";
import type { GamePartyInvite, GamePartyMember } from "#prisma/client";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_PARTY_INVITE_TTL_HOURS,
  DOTA_PARTY_SIZE,
  DOTA_PARTY_VERTICAL,
  DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS,
  DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS,
  DOTA_TEAM_DISCORD_VOICE_TTL_HOURS,
  DOTA_TEMP_PARTY_EXTEND_HOURS,
  DOTA_TEMP_PARTY_MAX_LIFETIME_HOURS,
  DOTA_TEMP_PARTY_TTL_HOURS,
  DOTA_VERTICAL,
  generateDotaPartyName,
  isDotaGreenFlagKey,
  isDotaPositionRole,
  isDotaRedFlagKey,
  type DotaPositionRole,
  type GamePartyJoinMode,
  type GamePartyKind
} from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { AuthService } from "../../auth/services/auth.service.js";
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
import { DiscordVoiceService } from "./discord-voice.service.js";
import type { PartyDiscordVoiceResponseDto } from "../dto/game-party-response.dto.js";
import { RedisService } from "../../../redis/redis.service.js";
import { createHash, randomBytes } from "node:crypto";

const INVITE_FLAG_LIMIT = 3;
const PARTY_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const TERMINAL_INVITE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = DOTA_PARTY_INVITE_TTL_HOURS * 60 * 60 * 1000;
const DISCORD_VOICE_READY_SYSTEM_MESSAGE = "__system__:discord_voice_ready";
const PARTY_SAFETY_SYSTEM_MESSAGE = "__system__:party_safety";
const PARTY_LINK_OPEN_DEDUPE_TTL_SECONDS = 60 * 60 * 24;
/** Matches JWT party-join TTL (7 days). */
const PARTY_JOIN_CODE_TTL_SECONDS = 60 * 60 * 24 * 7;


@Injectable()
export class GamePartiesService implements OnModuleInit {
  private readonly logger = new Logger(GamePartiesService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly discordVoiceService: DiscordVoiceService,
    private readonly entityAttributesRepository: EntityAttributesRepository,
    private readonly entityQualityConfirmationsRepository: EntityQualityConfirmationsRepository,
    private readonly entitiesRepository: EntitiesRepository,
    private readonly friendshipsRepository: FriendshipsRepository,
    private readonly gamePartiesRepository: GamePartiesRepository,
    private readonly jwtTokenService: JwtTokenService,
    @Inject(PARTY_REALTIME_PUBLISHER)
    private readonly partyRealtimeService: PartyRealtimePublisher,
    private readonly redisService: RedisService,
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

    await this.gamePartiesRepository.createChatMessage({
      message: PARTY_SAFETY_SYSTEM_MESSAGE,
      partyId: party.id,
      userId: currentUser.id
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

  async updateJoinMode(
    slug: string,
    joinMode: GamePartyJoinMode,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const party = await this.requireManagerParty(slug, currentUser.id);

    if (party.joinMode === joinMode) {
      return this.toPartyResponse(party, currentUser.id);
    }

    await this.gamePartiesRepository.updatePartyJoinMode(party.id, joinMode);
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

  async extendParty(slug: string, currentUser: AuthenticatedUser): Promise<GamePartyResponseDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);

    if (party.kind !== "PARTY" || !party.expiresAt) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Only temporary parties can be extended",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const membership = party.members.find((member) => member.userId === currentUser.id);
    const canExtend =
      party.ownerUserId === currentUser.id ||
      membership?.role === "OFFICER" ||
      membership?.role === "OWNER";

    if (!canExtend) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain or officers can extend this party",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const now = Date.now();
    const maxExpiresAt = new Date(
      party.createdAt.getTime() + DOTA_TEMP_PARTY_MAX_LIFETIME_HOURS * 60 * 60 * 1000
    );
    const base = Math.max(party.expiresAt.getTime(), now);
    const proposed = new Date(base + DOTA_TEMP_PARTY_EXTEND_HOURS * 60 * 60 * 1000);
    const nextExpiresAt = proposed.getTime() > maxExpiresAt.getTime() ? maxExpiresAt : proposed;

    if (nextExpiresAt.getTime() <= party.expiresAt.getTime() + 60_000) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Party already reached the maximum lifetime",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    let nextInviteUrl: string | undefined;

    if (party.discordChannelId && this.discordVoiceService.isConfigured()) {
      try {
        nextInviteUrl = await this.discordVoiceService.createInvite(party.discordChannelId, {
          maxAgeSeconds: Math.max(60, Math.floor((nextExpiresAt.getTime() - now) / 1000)),
          maxUses: 0
        });
      } catch (error) {
        this.logger.warn(
          `Failed to refresh Discord invite on extend for ${party.slug}: ${
            error instanceof Error ? error.message : "unknown"
          }`
        );
      }
    }

    const extended = await this.gamePartiesRepository.updatePartyExpiry(
      party.id,
      nextExpiresAt,
      party.expiresAt,
      nextInviteUrl
    );

    if (!extended) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Party expiry was already updated",
        statusCode: HttpStatus.CONFLICT
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
      const kept = await this.gamePartiesRepository.findById(party.id);

      if (!kept || this.isExpired(kept)) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      return this.toPartyResponse(kept, viewerUserId);
    }

    return this.toPartyResponse(party, viewerUserId);
  }

  async recordPartyLinkOpen(
    slug: string,
    viewerKey: string
  ): Promise<{ linkOpenCount: number }> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party || this.isExpired(party)) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const redis = await this.redisService.getClient();
    const viewerHash = createHash("sha256").update(viewerKey).digest("hex").slice(0, 24);
    const dedupeKey = `party:link-open-seen:${party.id}:${viewerHash}`;
    const countKey = `party:link-opens:${party.id}`;
    const wasNew = await redis.set(dedupeKey, "1", {
      EX: PARTY_LINK_OPEN_DEDUPE_TTL_SECONDS,
      NX: true
    });

    if (wasNew) {
      await redis.incr(countKey);
    }

    const raw = await redis.get(countKey);
    const linkOpenCount = Number(raw);
    return {
      linkOpenCount: Number.isFinite(linkOpenCount) && linkOpenCount > 0 ? Math.floor(linkOpenCount) : 0
    };
  }

  private async readPartyLinkOpenCount(partyId: string): Promise<number> {
    try {
      const redis = await this.redisService.getClient();
      const raw = await redis.get(`party:link-opens:${partyId}`);
      const count = Number(raw);
      return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    } catch {
      return 0;
    }
  }

  private async mintPartyJoinCode(slug: string, token: string): Promise<string> {
    const redis = await this.redisService.getClient();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomBytes(5).toString("base64url");
      const key = `party:join-code:${code}`;
      const created = await redis.set(
        key,
        JSON.stringify({ slug, token }),
        {
          EX: PARTY_JOIN_CODE_TTL_SECONDS,
          NX: true
        }
      );

      if (created) {
        return code;
      }
    }

    throw createAppException({
      code: AppErrorCode.Conflict,
      message: "Could not create a short join link. Try again.",
      statusCode: HttpStatus.CONFLICT
    });
  }

  private async readPartyJoinCode(
    code: string
  ): Promise<{ code: string; slug: string; token: string } | null> {
    const normalized = code.trim();

    if (!/^[A-Za-z0-9_-]{6,16}$/.test(normalized)) {
      return null;
    }

    try {
      const redis = await this.redisService.getClient();
      const raw = await redis.get(`party:join-code:${normalized}`);

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as { slug?: unknown; token?: unknown };

      if (typeof parsed.slug !== "string" || typeof parsed.token !== "string") {
        return null;
      }

      return { code: normalized, slug: parsed.slug, token: parsed.token };
    } catch {
      return null;
    }
  }

  /** Accepts either a short Redis join code or a legacy signed JWT. */
  private async resolvePartyJoinCredential(raw: string): Promise<string> {
    const value = raw.trim();

    if (value.includes(".")) {
      return value;
    }

    const resolved = await this.readPartyJoinCode(value);

    if (!resolved) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Join link is invalid or expired",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    return resolved.token;
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
      let partyExpired =
        invite.party.kind === "PARTY" &&
        invite.party.expiresAt !== null &&
        invite.party.expiresAt.getTime() <= now;

      if (partyExpired) {
        const purged = await this.purgeExpiredParty({
          discordChannelId: null,
          expiresAt: invite.party.expiresAt,
          id: invite.party.id,
          kind: invite.party.kind,
          ownerUserId: invite.party.ownerUserId
        });

        if (!purged) {
          partyExpired = false;
        }
      }

      const full = invite.party._count.members >= invite.party.maxMembers;
      const inviteStale =
        invite.status === "PENDING" && invite.createdAt.getTime() < inviteTtlCutoff;

      if (invite.status === "PENDING" && (partyExpired || full || inviteStale)) {
        await this.gamePartiesRepository.cancelPendingInvite(invite.id);
        continue;
      }

      liveInvites.push(
        this.toInviteDto(invite, "incoming", invite.party, inviteeMeta[invite.inviteeUserId])
      );
    }

    const outgoingInvites = [];

    for (const invite of outgoing) {
      let partyExpired =
        invite.party.kind === "PARTY" &&
        invite.party.expiresAt !== null &&
        invite.party.expiresAt.getTime() <= now;

      if (partyExpired) {
        const purged = await this.purgeExpiredParty({
          discordChannelId: null,
          expiresAt: invite.party.expiresAt,
          id: invite.party.id,
          kind: invite.party.kind,
          ownerUserId: invite.party.ownerUserId
        });

        if (!purged) {
          partyExpired = false;
        }
      }

      const full = invite.party._count.members >= invite.party.maxMembers;
      const inviteStale =
        invite.status === "PENDING" && invite.createdAt.getTime() < inviteTtlCutoff;

      if (invite.status === "PENDING" && (partyExpired || full || inviteStale)) {
        await this.gamePartiesRepository.cancelPendingInvite(invite.id);
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
      party: parties.at(-1) ?? null,
      team
    };
  }

  async inviteFriend(
    slug: string,
    input: CreatePartyInviteDto,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyInviteDto> {
    // Any party member can invite friends — not only captain/officer.
    const party = await this.requireMemberParty(slug, currentUser.id);
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

    await this.assertCanReceivePartyInvite(party.id, input.userId);

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

    let invite: GamePartyInvite;

    try {
      invite = await this.gamePartiesRepository.createInvite({
        inviteeUserId: input.userId,
        inviterUserId: currentUser.id,
        partyId: party.id,
        positionRole
      });
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Invite already pending",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }

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

      if (!party) {
      if (invite.status === "PENDING") {
        await this.gamePartiesRepository.cancelPendingInvite(invite.id);
      }

      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (this.isExpired(party)) {
      await this.purgeExpiredParty(party);
      const kept = await this.gamePartiesRepository.findById(party.id);

      if (!kept || this.isExpired(kept)) {
        if (invite.status === "PENDING") {
          await this.gamePartiesRepository.cancelPendingInvite(invite.id);
        }

        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      // Fall through with kept party after occupancy extend.
      return this.acceptInvite(inviteId, currentUser);
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

    if (isApplication) {
      await this.assertNotJoinBlocked(party.id, joiningUserId);
    }

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

    let closedInvites: GamePartyInvite[] = [];
    let joined: GamePartyMember | null = null;
    let acceptFailReason: "full" | "role_taken" | "already_on_other_team" | undefined;

    try {
      const accepted = await this.gamePartiesRepository.acceptInviteAtomically({
        inviteId: invite.id,
        maxMembers: party.maxMembers,
        partyId: party.id,
        positionRole: invite.positionRole,
        userId: joiningUserId
      });
      closedInvites = accepted.closedInvites;
      joined = accepted.member;
      acceptFailReason = accepted.reason;

      if (accepted.staleInvite) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Invite was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof Error && error.message === "INVITE_NO_LONGER_PENDING") {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Invite was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      throw error;
    }

    if (!joined) {
      // Role/full race: closedInvites already collected inside the transaction.
      await this.emitAutoClosedNotifications(closedInvites, party);

      if (acceptFailReason === "already_on_other_team") {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "You already belong to a Dota team",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw createAppException({
        code: AppErrorCode.Conflict,
        message:
          acceptFailReason === "role_taken"
            ? "This role is already taken"
            : "This team is already full",
        statusCode: HttpStatus.CONFLICT
      });
    }

    await this.clearLookingForUser(joiningUserId);
    await this.refreshRecruitLookingAttributes(party.ownerUserId, party.id);
    await this.gamePartiesRepository.deleteJoinBlock(party.id, joiningUserId);

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

    const allClosed = [...closedInvites, ...extraClosed];
    const closedById = new Map(allClosed.map((row) => [row.id, row] as const));
    const uniqueClosed = [...closedById.values()];
    const samePartyClosed = uniqueClosed.filter((row) => row.partyId === party.id);
    const otherPartyClosed = uniqueClosed.filter((row) => row.partyId !== party.id);

    await this.emitAutoClosedNotifications(samePartyClosed, party);
    await this.emitCrossPartyApplicationCancellations(otherPartyClosed);

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

    const partyResponse = await this.toPartyResponse(updated, currentUser.id);
    this.notifyPartyMembersJoined(partyResponse, notifyInvite, joiningUserId);

    if (isApplication) {
      this.partyRealtimeService.emitPartyNotification(joiningUserId, {
        invite: { ...notifyInvite, direction: "incoming" },
        type: "accepted"
      });
    }

    return {
      inviteKind: invite.kind === "APPLICATION" ? "APPLICATION" : "INVITE",
      inviteeUserId: invite.inviteeUserId,
      inviterUserId: invite.inviterUserId,
      notifyInvite,
      party: partyResponse
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

    const withdrawnByApplicant = isApplication && isInvitee;
    const resolved = withdrawnByApplicant
      ? await this.gamePartiesRepository.cancelPendingInvite(invite.id)
      : await this.gamePartiesRepository.declinePendingInvite(invite.id);

    if (!resolved) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Invite was already resolved",
        statusCode: HttpStatus.CONFLICT
      });
    }

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
        status: withdrawnByApplicant ? "CANCELLED" : "DECLINED"
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

      if (recruitParty.joinMode === "OPEN") {
        await this.assertNoActiveMembershipOfKind(currentUser.id, recruitParty.kind);
        await this.assertNotJoinBlocked(recruitParty.id, currentUser.id);

        const joined = await this.gamePartiesRepository.addMemberAtomically({
          maxMembers: recruitParty.maxMembers,
          partyId: recruitParty.id,
          positionRole: resolvedPosition,
          userId: currentUser.id
        });

        if (!joined.ok) {
          if (joined.reason === "already_on_other_team") {
            throw createAppException({
              code: AppErrorCode.Conflict,
              message: "You already belong to a Dota team",
              statusCode: HttpStatus.CONFLICT
            });
          }

          if (joined.reason === "party_gone") {
            throw createAppException({
              code: AppErrorCode.NotFound,
              message: "Team was not found",
              statusCode: HttpStatus.NOT_FOUND
            });
          }

          if (joined.reason === "full") {
            const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(
              recruitParty.id
            );
            await this.emitAutoClosedNotifications(closed, recruitParty);
            throw createAppException({
              code: AppErrorCode.Conflict,
              message: "This team is already full",
              statusCode: HttpStatus.CONFLICT
            });
          }

          const closed = await this.gamePartiesRepository.closePendingInvitesForPosition(
            recruitParty.id,
            resolvedPosition,
            { status: "CANCELLED" }
          );
          await this.emitAutoClosedNotifications(closed, recruitParty);
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This role is already taken",
            statusCode: HttpStatus.CONFLICT
          });
        }

        await this.emitCrossPartyApplicationCancellations(joined.cancelledApplications);

        const closedSameRole = await this.gamePartiesRepository.closePendingInvitesForPosition(
          recruitParty.id,
          resolvedPosition,
          { status: "CANCELLED" }
        );
        await this.emitAutoClosedNotifications(closedSameRole, recruitParty);

        await this.clearLookingForUser(currentUser.id);
        await this.refreshRecruitLookingAttributes(recruitParty.ownerUserId, recruitParty.id);

        const loaded = await this.loadPartyResponse(recruitParty.id, currentUser.id);

        if (!loaded) {
          throw createAppException({
            code: AppErrorCode.NotFound,
            message: "Team was not found",
            statusCode: HttpStatus.NOT_FOUND
          });
        }

        if (loaded.members.length >= loaded.maxMembers) {
          const closedFull = await this.gamePartiesRepository.cancelPendingInvitesForParty(loaded.id);
          await this.emitAutoClosedNotifications(closedFull, recruitParty);
        }

        const joiner = await this.usersRepository.findById(currentUser.id);
        invite = this.toInviteDto(
          {
            createdAt: new Date(),
            id: `open-join-${recruitParty.id}-${currentUser.id}`,
            invitee: {
              displayName: joiner?.displayName ?? currentUser.displayName,
              id: currentUser.id
            },
            inviteeUserId: currentUser.id,
            kind: "APPLICATION",
            positionRole: resolvedPosition,
            status: "ACCEPTED"
          },
          "incoming",
          recruitParty
        );
        inviteDirection = "incoming";
        partyResponse = loaded;
        this.notifyPartyMembersJoined(partyResponse, invite, currentUser.id);
      } else {
        await this.assertNotJoinBlocked(recruitParty.id, currentUser.id);
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
      }
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
  ): Promise<{ code: string; token: string }> {
    const party = await this.requireMemberParty(slug, currentUser.id);
    const token = this.jwtTokenService.signPartyJoinToken(party.id, party.slug);
    const code = await this.mintPartyJoinCode(party.slug, token);

    return { code, token };
  }

  async resolveJoinCode(code: string): Promise<{ code: string; slug: string }> {
    const resolved = await this.readPartyJoinCode(code);

    if (!resolved) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Join link is invalid or expired",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return { code: resolved.code, slug: resolved.slug };
  }

  async claimPartySeat(
    slug: string,
    positionRole: DotaPositionRole,
    currentUser: AuthenticatedUser
  ): Promise<{
    application: GamePartyInviteDto | null;
    party: GamePartyResponseDto;
  }> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(DOTA_PARTY_VERTICAL, slug);

    if (!party || this.isExpired(party)) {
      if (party) {
        await this.purgeExpiredParty(party);
      }

      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.joinPartyAsApplicant(party, currentUser, positionRole);
  }

  async joinByToken(
    token: string,
    currentUser: AuthenticatedUser,
    positionRole?: DotaPositionRole
  ): Promise<{
    application: GamePartyInviteDto | null;
    party: GamePartyResponseDto;
  }> {
    const jwtToken = await this.resolvePartyJoinCredential(token);
    const verified = this.jwtTokenService.verifyPartyJoinToken(jwtToken);

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
      const kept = await this.gamePartiesRepository.findById(party.id);

      if (!kept || this.isExpired(kept)) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      return this.joinByToken(token, currentUser, positionRole);
    }

    return this.joinPartyAsApplicant(party, currentUser, positionRole ?? null);
  }

  private async joinPartyAsApplicant(
    party: NonNullable<Awaited<ReturnType<GamePartiesRepository["findById"]>>>,
    currentUser: AuthenticatedUser,
    positionRole?: DotaPositionRole | null
  ): Promise<{
    application: GamePartyInviteDto | null;
    party: GamePartyResponseDto;
  }> {
    const alreadyMember = party.members.some((member) => member.userId === currentUser.id);

    if (alreadyMember) {
      if (positionRole) {
        const claimed = party.members.some(
          (member) => member.positionRole === positionRole && member.userId !== currentUser.id
        );
        const self = party.members.find((member) => member.userId === currentUser.id);

        if (claimed) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "This role is already taken",
            statusCode: HttpStatus.CONFLICT
          });
        }

        if (self && self.positionRole !== positionRole) {
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

          const closed = await this.gamePartiesRepository.closePendingInvitesForPosition(
            party.id,
            positionRole,
            { status: "DECLINED" }
          );
          await this.emitAutoClosedNotifications(closed, party);
          await this.refreshRecruitLookingAttributes(party.ownerUserId, party.id);

          const refreshed = await this.gamePartiesRepository.findById(party.id);
          return {
            application: null,
            party: await this.toPartyResponse(refreshed ?? party, currentUser.id)
          };
        }
      }

      const latest = await this.gamePartiesRepository.findById(party.id);
      return {
        application: null,
        party: await this.toPartyResponse(latest ?? party, currentUser.id)
      };
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

    if (positionRole) {
      const roleTaken = party.members.some((member) => member.positionRole === positionRole);
      if (roleTaken) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    await this.assertNotJoinBlocked(party.id, currentUser.id);

    // CONFIRM: creates an application; managers accept before membership.
    if (party.joinMode === "CONFIRM") {
      const existingInvite = await this.gamePartiesRepository.findPendingInvite(
        party.id,
        currentUser.id
      );

      if (existingInvite) {
        return {
          application: null,
          party: await this.toPartyResponse(party, currentUser.id)
        };
      }

      const application = await this.inviteWithoutFriendshipCheck(
        party.slug,
        currentUser.id,
        { id: party.ownerUserId } as AuthenticatedUser,
        {
          inviteKind: "APPLICATION",
          positionRole: positionRole ?? null
        }
      );

      return {
        application,
        party: await this.toPartyResponse(party, currentUser.id)
      };
    }

    const joined = await this.gamePartiesRepository.addMemberAtomically({
      maxMembers: party.maxMembers,
      partyId: party.id,
      positionRole: positionRole ?? null,
      userId: currentUser.id
    });

    if (!joined.ok) {
      if (joined.reason === "already_on_other_team") {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "You already belong to a Dota team",
          statusCode: HttpStatus.CONFLICT
        });
      }

      if (joined.reason === "party_gone") {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      if (joined.reason === "role_taken" && positionRole) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This role is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }

      const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(party.id);
      await this.emitAutoClosedNotifications(closed, party);
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This team is already full",
        statusCode: HttpStatus.CONFLICT
      });
    }

    await this.emitCrossPartyApplicationCancellations(joined.cancelledApplications);

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

    const partyResponse = await this.toPartyResponse(updated, currentUser.id);
    const joiner = await this.usersRepository.findById(currentUser.id);
    const joinedNotify = this.toInviteDto(
      {
        createdAt: new Date(),
        id: `open-join-${party.id}-${currentUser.id}`,
        invitee: {
          displayName: joiner?.displayName ?? currentUser.displayName,
          id: currentUser.id
        },
        inviteeUserId: currentUser.id,
        kind: "APPLICATION",
        positionRole: positionRole ?? null,
        status: "ACCEPTED"
      },
      "outgoing",
      updated
    );
    this.notifyPartyMembersJoined(partyResponse, joinedNotify, currentUser.id);

    return {
      application: null,
      party: partyResponse
    };
  }

  /** Toast + sound for everyone already in the party when someone joins. */
  private notifyPartyMembersJoined(
    party: GamePartyResponseDto,
    invite: GamePartyInviteDto,
    joinerUserId: string
  ): void {
    for (const member of party.members) {
      if (member.userId === joinerUserId) {
        continue;
      }

      this.partyRealtimeService.emitPartyNotification(member.userId, {
        invite: { ...invite, direction: "outgoing" },
        type: "member_joined"
      });
    }
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

    if ((options?.inviteKind ?? "INVITE") === "INVITE") {
      await this.assertCanReceivePartyInvite(party.id, targetUserId);
    }

    const existingInvite = await this.gamePartiesRepository.findPendingInvite(party.id, targetUserId);

    if (existingInvite) {
      // Managers re-inviting after kick: drop stale PENDING and mint a fresh invite id.
      if ((options?.inviteKind ?? "INVITE") === "INVITE") {
        await this.gamePartiesRepository.cancelPendingInvite(existingInvite.id);
      } else {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Invite already pending",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    if ((options?.inviteKind ?? "INVITE") === "APPLICATION") {
      await this.assertNotJoinBlocked(party.id, targetUserId);
      await this.assertCanSubmitPartyApplication(party.id, targetUserId);
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

    let invite: GamePartyInvite;

    try {
      invite = await this.gamePartiesRepository.createInvite({
        inviteeUserId: targetUserId,
        inviteKind: options?.inviteKind ?? "INVITE",
        inviterUserId: currentUser.id,
        partyId: party.id,
        positionRole
      });
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Invite already pending",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }

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
        const purged = await this.purgeExpiredParty(party);

        if (!purged) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            message: "Party was extended because Discord voice is still occupied",
            statusCode: HttpStatus.CONFLICT
          });
        }

        return { ok: true };
      }

      if (party.members.length > 1) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Owner can leave only after other members leave, or delete the team",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      await this.assertDiscordVoiceRemoved(party.discordChannelId);
      await this.gamePartiesRepository.deleteParty(party.id);
      await this.clearLookingForUser(currentUser.id);
      return { ok: true };
    }

    await this.revokeDiscordVoiceAccessForUser(party.discordChannelId, currentUser.id);
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
      const purged = await this.purgeExpiredParty(party);

      if (!purged) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Party was extended because Discord voice is still occupied",
          statusCode: HttpStatus.CONFLICT
        });
      }

      return { ok: true };
    }

    const closed = await this.gamePartiesRepository.cancelPendingInvitesForParty(party.id);
    await this.emitAutoClosedNotifications(closed, party);
    await this.assertDiscordVoiceRemoved(party.discordChannelId);
    await this.gamePartiesRepository.deleteParty(party.id);
    await this.clearLookingForUser(currentUser.id);
    return { ok: true };
  }

  async ensureDiscordVoice(
    slug: string,
    currentUser: AuthenticatedUser,
    intent: "join" | "share" = "share"
  ): Promise<{
    chatMessage: GamePartyChatMessageDto | null;
    party: GamePartyResponseDto;
    voice: PartyDiscordVoiceResponseDto;
  }> {
    if (!this.discordVoiceService.isConfigured()) {
      throw createAppException({
        code: AppErrorCode.ServiceUnavailable,
        message: "Discord voice is not configured",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE
      });
    }

    let party = await this.requireMemberParty(slug, currentUser.id);

    // Drop expired team/party voice before recreating.
    if (
      party.discordChannelId &&
      party.discordVoiceExpiresAt &&
      party.discordVoiceExpiresAt.getTime() <= Date.now()
    ) {
      const discordGone = await this.deleteDiscordVoiceIfPresent(party.discordChannelId);

      if (!discordGone) {
        throw createAppException({
          code: AppErrorCode.ServiceUnavailable,
          message: "Could not recycle Discord voice channel",
          statusCode: HttpStatus.SERVICE_UNAVAILABLE
        });
      }

      await this.gamePartiesRepository.clearDiscordVoice(party.id);
      const refreshed = await this.gamePartiesRepository.findById(party.id);

      if (!refreshed) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Team was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      party = refreshed;
    }

    // Backfill TTL on older team voices created before expiresAt existed.
    if (
      party.kind === "TEAM" &&
      party.discordChannelId &&
      !party.discordVoiceExpiresAt
    ) {
      const backfillExpires = new Date(
        (party.discordVoiceCreatedAt?.getTime() ?? Date.now()) +
          DOTA_TEAM_DISCORD_VOICE_TTL_HOURS * 60 * 60 * 1000
      );
      await this.gamePartiesRepository.updateDiscordVoiceExpiry(
        party.id,
        backfillExpires,
        null
      );
      const withExpiry = await this.gamePartiesRepository.findById(party.id);

      if (withExpiry) {
        party = withExpiry;
      }
    }

    let channelId = party.discordChannelId;
    let shareInviteUrl = party.discordInviteUrl;
    let chatMessage: GamePartyChatMessageDto | null = null;
    let responseParty = party;
    const voiceExpiresAt = this.resolveNewDiscordVoiceExpiresAt(party);

    if (!channelId) {
      try {
        const created = await this.discordVoiceService.createPartyVoice({
          maxAgeSeconds: this.remainingPartyTtlSeconds(voiceExpiresAt),
          name: party.name
        });

        const voiceCreatedAt = new Date();
        const claimed = await this.gamePartiesRepository.claimDiscordVoice(party.id, {
          discordChannelId: created.channelId,
          discordInviteUrl: created.inviteUrl,
          discordVoiceCreatedAt: voiceCreatedAt,
          discordVoiceExpiresAt: voiceExpiresAt
        });

        if (!claimed) {
          await this.discordVoiceService.deleteChannel(created.channelId);
          const latest = await this.gamePartiesRepository.findById(party.id);

          if (!latest?.discordChannelId) {
            throw createAppException({
              code: AppErrorCode.ServiceUnavailable,
              message: "Could not create Discord voice channel",
              statusCode: HttpStatus.SERVICE_UNAVAILABLE
            });
          }

          channelId = latest.discordChannelId;
          shareInviteUrl = latest.discordInviteUrl;
          responseParty = latest;
        } else {
          channelId = created.channelId;
          shareInviteUrl = created.inviteUrl;
          const full = await this.gamePartiesRepository.findById(party.id);

          if (!full) {
            throw createAppException({
              code: AppErrorCode.NotFound,
              message: "Team was not found",
              statusCode: HttpStatus.NOT_FOUND
            });
          }

          responseParty = full;
          const systemChat = await this.gamePartiesRepository.createChatMessage({
            message: DISCORD_VOICE_READY_SYSTEM_MESSAGE,
            partyId: party.id,
            userId: currentUser.id
          });
          chatMessage = this.toChatMessageDto(systemChat);
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        this.logger.error(
          error instanceof Error ? error.message : "Discord voice create failed",
          error instanceof Error ? error.stack : undefined
        );
        throw createAppException({
          code: AppErrorCode.ServiceUnavailable,
          message: "Could not create Discord voice channel",
          statusCode: HttpStatus.SERVICE_UNAVAILABLE
        });
      }
    }

    if (!channelId) {
      throw createAppException({
        code: AppErrorCode.ServiceUnavailable,
        message: "Could not create Discord voice channel",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE
      });
    }

    try {
      await this.discordVoiceService.ensureVoiceChannelAcl(channelId);
    } catch (error) {
      this.logger.warn(
        `Failed to ensure Discord voice ACL for ${channelId}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }

    if (!shareInviteUrl) {
      try {
        const inviteTtl = this.discordVoiceInviteTtlSeconds(responseParty);
        shareInviteUrl = await this.discordVoiceService.createInvite(channelId, {
          maxAgeSeconds: inviteTtl,
          maxUses: 0
        });
        await this.gamePartiesRepository.updateDiscordVoice(responseParty.id, {
          discordChannelId: channelId,
          discordInviteUrl: shareInviteUrl,
          discordVoiceCreatedAt: responseParty.discordVoiceCreatedAt ?? new Date(),
          discordVoiceExpiresAt:
            responseParty.discordVoiceExpiresAt ??
            this.resolveNewDiscordVoiceExpiresAt(responseParty)
        });
        const refreshed = await this.gamePartiesRepository.findById(responseParty.id);

        if (refreshed) {
          responseParty = refreshed;
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        this.logger.error(
          error instanceof Error ? error.message : "Discord share invite failed",
          error instanceof Error ? error.stack : undefined
        );
        throw createAppException({
          code: AppErrorCode.ServiceUnavailable,
          message: "Could not create Discord voice invite",
          statusCode: HttpStatus.SERVICE_UNAVAILABLE
        });
      }
    }

    let inviteUrl = shareInviteUrl;
    const guildId = this.discordVoiceService.getGuildId();
    let movedToVoice = false;

    if (intent === "join") {
      const discordUserId = await this.authService.getDiscordUserId(currentUser.id);

      if (!discordUserId) {
        throw createAppException({
          code: AppErrorCode.DiscordNotLinked,
          message: "Link your Discord account to join party voice",
          statusCode: HttpStatus.FORBIDDEN
        });
      }

      // Member overwrite is required now that @everyone is denied CONNECT.
      // Bot role must sit above target members (Manage Channels + hierarchy).
      try {
        await this.discordVoiceService.grantMemberVoiceAccess(channelId, discordUserId);
      } catch (grantError) {
        this.logger.error(
          `Discord grant voice access failed for ${discordUserId} on ${channelId}: ${
            grantError instanceof Error ? grantError.message : "unknown"
          }`
        );
        throw createAppException({
          code: AppErrorCode.ServiceUnavailable,
          message:
            "Could not grant Discord voice access. Raise the bot role above members and ensure Manage Channels.",
          statusCode: HttpStatus.SERVICE_UNAVAILABLE
        });
      }

      movedToVoice = await this.discordVoiceService.tryMoveMemberToVoice(
        channelId,
        discordUserId
      );

      try {
        inviteUrl = await this.discordVoiceService.createJoinInvite(channelId);
      } catch (joinInviteError) {
        // Fall back to multi-use share invite if one-shot invite fails.
        this.logger.warn(
          `Discord one-shot join invite failed for ${channelId}, using share invite: ${
            joinInviteError instanceof Error ? joinInviteError.message : "unknown"
          }`
        );
        inviteUrl = shareInviteUrl;
      }

      if (!inviteUrl) {
        throw createAppException({
          code: AppErrorCode.ServiceUnavailable,
          message: "Could not create Discord voice invite",
          statusCode: HttpStatus.SERVICE_UNAVAILABLE
        });
      }
    }

    return {
      chatMessage,
      party: await this.toPartyResponse(responseParty, currentUser.id),
      voice: {
        channelId,
        expiresAt: responseParty.discordVoiceExpiresAt?.toISOString() ?? null,
        guildId,
        inviteUrl,
        movedToVoice
      }
    };
  }

  async extendDiscordVoice(
    slug: string,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyResponseDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);

    if (party.kind !== "TEAM") {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Only team Discord voice can be extended separately",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (!party.discordChannelId || !party.discordVoiceExpiresAt || !party.discordVoiceCreatedAt) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "No active Discord voice to extend",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (!this.isPartyManager(party, currentUser.id)) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain or officers can extend Discord voice",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const now = Date.now();
    const maxExpiresAt = new Date(
      party.discordVoiceCreatedAt.getTime() +
        DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS * 60 * 60 * 1000
    );
    const base = Math.max(party.discordVoiceExpiresAt.getTime(), now);
    const proposed = new Date(base + DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS * 60 * 60 * 1000);
    const nextExpiresAt = proposed.getTime() > maxExpiresAt.getTime() ? maxExpiresAt : proposed;

    if (nextExpiresAt.getTime() <= party.discordVoiceExpiresAt.getTime() + 60_000) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Discord voice already reached the maximum lifetime",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    let nextInviteUrl: string | undefined;

    if (this.discordVoiceService.isConfigured()) {
      try {
        nextInviteUrl = await this.discordVoiceService.createInvite(party.discordChannelId, {
          maxAgeSeconds: Math.max(60, Math.floor((nextExpiresAt.getTime() - now) / 1000)),
          maxUses: 0
        });
      } catch (error) {
        this.logger.warn(
          `Failed to refresh Discord invite on voice extend for ${party.slug}: ${
            error instanceof Error ? error.message : "unknown"
          }`
        );
      }
    }

    const extended = await this.gamePartiesRepository.updateDiscordVoiceExpiry(
      party.id,
      nextExpiresAt,
      party.discordVoiceExpiresAt,
      nextInviteUrl
    );

    if (!extended) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Discord voice expiry was already updated",
        statusCode: HttpStatus.CONFLICT
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

  private resolveNewDiscordVoiceExpiresAt(party: {
    expiresAt: Date | null;
    kind: GamePartyKind;
  }): Date {
    if (party.kind === "PARTY" && party.expiresAt) {
      return party.expiresAt;
    }

    return new Date(Date.now() + DOTA_TEAM_DISCORD_VOICE_TTL_HOURS * 60 * 60 * 1000);
  }

  private discordVoiceInviteTtlSeconds(party: {
    discordVoiceExpiresAt: Date | null;
    expiresAt: Date | null;
  }): number {
    return this.remainingPartyTtlSeconds(party.discordVoiceExpiresAt ?? party.expiresAt);
  }

  async listChatMessages(
    slug: string,
    currentUser: AuthenticatedUser,
    before?: string,
    limit?: number
  ): Promise<GamePartyChatMessagesPageDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);
    await this.ensurePartySafetyChatMessage(party.id, party.ownerUserId);
    const rows = await this.gamePartiesRepository.listChatMessages(party.id, before, limit);
    const chronological = [...rows].reverse();
    const pageSize = limit ?? 50;
    const oldestLoaded = rows.at(-1);

    return {
      messages: chronological.map((row) => this.toChatMessageDto(row)),
      nextCursor: rows.length >= Math.min(pageSize, 100) && oldestLoaded ? oldestLoaded.id : null
    };
  }

  /** First chat line: safety tip. Seeded on create; backfilled for older parties. */
  private async ensurePartySafetyChatMessage(partyId: string, ownerUserId: string): Promise<void> {
    const existing = await this.gamePartiesRepository.findChatMessageByExactText(
      partyId,
      PARTY_SAFETY_SYSTEM_MESSAGE
    );

    if (existing) {
      return;
    }

    await this.gamePartiesRepository.createChatMessage({
      message: PARTY_SAFETY_SYSTEM_MESSAGE,
      partyId,
      userId: ownerUserId
    });
  }

  async sendChatMessage(
    slug: string,
    message: string,
    currentUser: AuthenticatedUser
  ): Promise<GamePartyChatMessageDto> {
    const party = await this.requireMemberParty(slug, currentUser.id);

    if (typeof message !== "string") {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Message cannot be empty",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const trimmed = message.trim();

    if (trimmed.length < 1) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Message cannot be empty",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (trimmed.length > 10_000) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Message is too long",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (trimmed.startsWith("__system__:")) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Invalid message",
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

    await this.revokeDiscordVoiceAccessForUser(party.discordChannelId, targetUserId);
    await this.gamePartiesRepository.kickMemberAtomically(party.id, targetUserId);
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
      const refreshed = await this.gamePartiesRepository.findById(full.id);

      if (!refreshed || this.isExpired(refreshed)) {
        return null;
      }

      return this.toPartyResponse(refreshed, viewerUserId);
    }

    return this.toPartyResponse(full, viewerUserId);
  }

  /** @returns true when the party row was deleted */
  private async purgeExpiredParty(party: {
    discordChannelId?: string | null;
    expiresAt: Date | null;
    id: string;
    kind: GamePartyKind;
    ownerUserId: string;
  }): Promise<boolean> {
    const full = await this.gamePartiesRepository.findById(party.id);

    if (!full || !this.isExpired(full)) {
      return false;
    }

    if (await this.autoExtendWhileVoiceOccupied(full.id)) {
      return false;
    }

    try {
      const discordGone = await this.deleteDiscordVoiceIfPresent(full.discordChannelId ?? null);

      if (!discordGone) {
        this.logger.warn(
          `Expired party ${full.id}: Discord channel ${full.discordChannelId} still present; keeping party row for retry`
        );
        return false;
      }

      await this.gamePartiesRepository.deleteParty(full.id);
    } catch (error) {
      if (isPrismaErrorCode(error, "P2025")) {
        // Already deleted concurrently.
      } else {
        throw error;
      }
    }

    await this.clearLookingForUser(full.ownerUserId);
    return true;
  }

  /**
   * If party Discord voice still has linked members connected, bump TTL by +3h
   * (no max-lifetime cap — do not kick people mid-call).
   */
  private async autoExtendWhileVoiceOccupied(partyId: string): Promise<boolean> {
    const party = await this.gamePartiesRepository.findById(partyId);

    if (!party?.discordChannelId || !this.discordVoiceService.isConfigured()) {
      return false;
    }

    const discordUserIds = (
      await Promise.all(
        party.members.map((member) => this.authService.getDiscordUserId(member.userId))
      )
    ).filter((id): id is string => Boolean(id));

    const occupied = await this.discordVoiceService.isVoiceChannelOccupied(
      party.discordChannelId,
      discordUserIds
    );

    if (!occupied) {
      return false;
    }

    const now = Date.now();
    const extendMs = DOTA_TEMP_PARTY_EXTEND_HOURS * 60 * 60 * 1000;
    let nextInviteUrl: string | undefined;

    try {
      const inviteTtlSeconds = Math.max(60, Math.floor(extendMs / 1000));
      nextInviteUrl = await this.discordVoiceService.createInvite(party.discordChannelId, {
        maxAgeSeconds: inviteTtlSeconds,
        maxUses: 0
      });
    } catch (error) {
      this.logger.warn(
        `Failed to refresh Discord invite on occupancy extend for ${party.slug}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }

    if (party.kind === "PARTY" && party.expiresAt) {
      const nextExpiresAt = new Date(Math.max(party.expiresAt.getTime(), now) + extendMs);
      await this.gamePartiesRepository.setPartyExpiry(party.id, nextExpiresAt, nextInviteUrl);
    } else if (party.discordVoiceExpiresAt) {
      const nextVoiceExpiresAt = new Date(
        Math.max(party.discordVoiceExpiresAt.getTime(), now) + extendMs
      );
      await this.gamePartiesRepository.setDiscordVoiceExpiry(
        party.id,
        nextVoiceExpiresAt,
        nextInviteUrl
      );
    } else {
      const nextVoiceExpiresAt = new Date(now + extendMs);
      await this.gamePartiesRepository.setDiscordVoiceExpiry(
        party.id,
        nextVoiceExpiresAt,
        nextInviteUrl
      );
    }

    this.logger.log(
      `Auto-extended ${party.slug} by ${DOTA_TEMP_PARTY_EXTEND_HOURS}h — Discord voice still occupied`
    );

    try {
      const refreshed = await this.gamePartiesRepository.findById(party.id);

      if (refreshed) {
        this.partyRealtimeService.broadcastPartyUpdated(
          await this.toPartyResponse(refreshed)
        );
      }
    } catch {
      // Broadcast best-effort.
    }

    return true;
  }

  private async runCleanupSafely(): Promise<void> {
    try {
      // Discord first, then DB — avoids orphan channels when process dies mid-cleanup.
      const expired = await this.gamePartiesRepository.findExpiredParties();
      const expiredPartyIds: string[] = [];
      let occupancyExtended = 0;

      for (const party of expired) {
        if (await this.autoExtendWhileVoiceOccupied(party.id)) {
          occupancyExtended += 1;
          continue;
        }

        const discordGone = await this.deleteDiscordVoiceIfPresent(party.discordChannelId);

        if (!discordGone) {
          this.logger.warn(
            `Expired party ${party.slug}: Discord channel ${party.discordChannelId} still present; keeping party row for retry`
          );
          continue;
        }

        expiredPartyIds.push(party.id);
        await this.clearLookingForUser(party.ownerUserId);
      }

      if (expiredPartyIds.length > 0) {
        await this.gamePartiesRepository.deletePartiesByIds(expiredPartyIds);
      }

      const now = new Date();
      const legacyCreatedBefore = new Date(
        now.getTime() - DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS * 60 * 60 * 1000
      );
      const expiredVoices = await this.gamePartiesRepository.listExpiredDiscordVoices(
        now,
        legacyCreatedBefore
      );

      let clearedVoices = 0;

      for (const voice of expiredVoices) {
        // Temporary parties handled above; only TEAM voices here.
        if (voice.kind === "PARTY") {
          continue;
        }

        if (await this.autoExtendWhileVoiceOccupied(voice.id)) {
          occupancyExtended += 1;
          continue;
        }

        const discordGone = await this.deleteDiscordVoiceIfPresent(voice.discordChannelId);

        if (!discordGone) {
          this.logger.warn(
            `Expired Discord voice for ${voice.slug}: channel ${voice.discordChannelId} still present; will retry next cleanup`
          );
          continue;
        }

        await this.gamePartiesRepository.clearDiscordVoice(voice.id);
        clearedVoices += 1;

        try {
          const updated = await this.getPartyBySlug(voice.slug);
          this.partyRealtimeService.broadcastPartyUpdated(updated);
        } catch {
          // Party deleted concurrently or already gone.
        }
      }

      const stalePending = await this.gamePartiesRepository.cancelStalePendingInvites(
        new Date(Date.now() - INVITE_TTL_MS)
      );

      const staleInvites = await this.gamePartiesRepository.deleteStaleTerminalInvites(
        new Date(Date.now() - TERMINAL_INVITE_RETENTION_MS)
      );

      if (
        expiredPartyIds.length > 0 ||
        clearedVoices > 0 ||
        occupancyExtended > 0 ||
        stalePending > 0 ||
        staleInvites > 0
      ) {
        this.logger.log(
          `Party cleanup removed ${expiredPartyIds.length} expired parties, ${clearedVoices} expired Discord voices, occupancy-extended ${occupancyExtended}, cancelled ${stalePending} stale pending invites, and deleted ${staleInvites} terminal invites`
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : "Unknown party cleanup error",
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  private async deleteDiscordVoiceIfPresent(channelId: string | null | undefined): Promise<boolean> {
    if (!channelId) {
      return true;
    }

    return this.discordVoiceService.deleteChannel(channelId);
  }

  /** Delete Discord voice before removing the party row — never leave orphan channels. */
  private async assertDiscordVoiceRemoved(channelId: string | null | undefined): Promise<void> {
    const discordGone = await this.deleteDiscordVoiceIfPresent(channelId);

    if (!discordGone) {
      throw createAppException({
        code: AppErrorCode.ServiceUnavailable,
        message: "Could not delete Discord voice channel; try again",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE
      });
    }
  }

  private async revokeDiscordVoiceAccessForUser(
    channelId: string | null | undefined,
    userId: string
  ): Promise<void> {
    if (!channelId || !this.discordVoiceService.isConfigured()) {
      return;
    }

    const discordUserId = await this.authService.getDiscordUserId(userId);

    if (!discordUserId) {
      return;
    }

    await this.discordVoiceService.revokeMemberVoiceAccess(channelId, discordUserId);
  }

  private remainingPartyTtlSeconds(expiresAt: Date | null): number {
    if (!expiresAt) {
      return DOTA_TEMP_PARTY_TTL_HOURS * 60 * 60;
    }

    return Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
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

  private async assertNotJoinBlocked(partyId: string, userId: string): Promise<void> {
    const block = await this.gamePartiesRepository.findJoinBlock(partyId, userId);

    if (!block) {
      return;
    }

    throw createAppException({
      code: AppErrorCode.Forbidden,
      message: "You were removed from this party. Wait for a new invite to rejoin.",
      statusCode: HttpStatus.FORBIDDEN
    });
  }

  private async assertCanReceivePartyInvite(partyId: string, inviteeUserId: string): Promise<void> {
    const declined = await this.gamePartiesRepository.hasDeclinedPartyInvite(
      partyId,
      inviteeUserId,
      "INVITE"
    );

    if (!declined) {
      return;
    }

    throw createAppException({
      code: AppErrorCode.Forbidden,
      message: "This player declined an invite to this party",
      statusCode: HttpStatus.FORBIDDEN
    });
  }

  private async assertCanSubmitPartyApplication(partyId: string, applicantUserId: string): Promise<void> {
    const declined = await this.gamePartiesRepository.hasDeclinedPartyInvite(
      partyId,
      applicantUserId,
      "APPLICATION"
    );

    if (!declined) {
      return;
    }

    throw createAppException({
      code: AppErrorCode.Forbidden,
      message: "Your application to this party was declined",
      statusCode: HttpStatus.FORBIDDEN
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
    const isMember = Boolean(
      viewerUserId && party.members.some((member) => member.userId === viewerUserId)
    );
    const maxExpiresAtMs =
      party.createdAt.getTime() + DOTA_TEMP_PARTY_MAX_LIFETIME_HOURS * 60 * 60 * 1000;
    const canExtendParty =
      party.kind === "PARTY" &&
      party.expiresAt !== null &&
      (isOwner || isOfficer) &&
      party.expiresAt.getTime() < maxExpiresAtMs - 60_000;

    const voiceCreatedAt = party.discordVoiceCreatedAt;
    const voiceExpiresAt = party.discordVoiceExpiresAt;
    const voiceMaxExpiresAtMs = voiceCreatedAt
      ? voiceCreatedAt.getTime() + DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS * 60 * 60 * 1000
      : 0;
    const canExtendDiscordVoice =
      party.kind === "TEAM" &&
      Boolean(party.discordChannelId) &&
      voiceExpiresAt !== null &&
      voiceCreatedAt !== null &&
      (isOwner || isOfficer) &&
      voiceExpiresAt.getTime() < voiceMaxExpiresAtMs - 60_000;

    const canManageParty = isOwner || isOfficer;
    const linkOpenCount = canManageParty ? await this.readPartyLinkOpenCount(party.id) : null;

    return {
      canExtendDiscordVoice,
      canExtendParty,
      canManageParty,
      // Multi-use Discord invites must not leak on public party pages / watchers.
      discordInviteUrl: isMember ? (party.discordInviteUrl ?? null) : null,
      discordVoiceAvailable: this.discordVoiceService.isConfigured(),
      discordVoiceExpiresAt: voiceExpiresAt?.toISOString() ?? null,
      expiresAt: party.expiresAt?.toISOString() ?? null,
      id: party.id,
      isMember,
      isOfficer,
      isOwner,
      joinMode: party.joinMode === "OPEN" ? "OPEN" : "CONFIRM",
      kind: party.kind,
      linkOpenCount,
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
      partyId?: string;
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

  /**
   * After joining party A: other parties' captains drop this user's pending applications.
   * Notifies invitee + managers of each cancelled application party.
   */
  private async emitCrossPartyApplicationCancellations(
    closed: Array<{
      createdAt: Date;
      id: string;
      inviteeUserId: string;
      inviterUserId: string;
      kind: "INVITE" | "APPLICATION";
      partyId: string;
      positionRole: string | null;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
    }>
  ): Promise<void> {
    if (closed.length === 0) {
      return;
    }

    const byPartyId = new Map<string, typeof closed>();

    for (const invite of closed) {
      const list = byPartyId.get(invite.partyId) ?? [];
      list.push(invite);
      byPartyId.set(invite.partyId, list);
    }

    for (const [partyId, invites] of byPartyId) {
      const party = await this.gamePartiesRepository.findById(partyId);

      if (!party) {
        continue;
      }

      await this.emitAutoClosedNotifications(invites, party);

      const managerIds = new Set<string>([party.ownerUserId]);
      for (const member of party.members) {
        if (member.role === "OFFICER") {
          managerIds.add(member.userId);
        }
      }

      const notifications = await this.toAutoClosedNotifications(invites, party);

      for (const item of notifications) {
        for (const managerId of managerIds) {
          this.partyRealtimeService.emitPartyNotification(managerId, {
            invite: { ...item.invite, direction: "outgoing" },
            type: "declined"
          });
        }
      }
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
