import { HttpStatus, Inject, Injectable, forwardRef } from "@nestjs/common";
import type { Entity } from "#prisma/client";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_CONFIRMATION_MILESTONE,
  DOTA_FLAG_LIMIT_PER_SIDE,
  DOTA_LFG_TTL_SECONDS,
  DOTA_PARTY_SIZE,
  DOTA_PARTY_VERTICAL,
  DOTA_POSITION_ROLES,
  DOTA_VERTICAL,
  isDotaConfirmationKey,
  isDotaGreenFlagKey,
  isDotaMatchMode,
  isDotaPositionRole,
  isDotaRedFlagKey,
  type DotaPositionRole
} from "@reviewo/shared";

import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { AuthService } from "../../auth/services/auth.service.js";
import { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import { createSlug } from "../../entities/services/entity-slug.js";
import { GamePartiesRepository } from "../../social/repositories/game-parties.repository.js";
import { FriendshipsService } from "../../social/services/friendships.service.js";
import {
  PARTY_REALTIME_PUBLISHER,
  type PartyRealtimePublisher
} from "../../social/party-realtime.types.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import type { ConfirmDotaQualitiesDto } from "../dto/confirm-dota-qualities.dto.js";
import type { CreateDotaProfileDto } from "../dto/create-dota-profile.dto.js";
import type { DotaProfileResponseDto } from "../dto/dota-profile-response.dto.js";
import type { DotaProfileSearchResponseDto } from "../dto/dota-profile-search-response.dto.js";
import type { GuestDotaProfileCreateResponseDto } from "../dto/guest-dota-profile-create-response.dto.js";
import type { DotaLfgListResponseDto } from "../dto/dota-lfg-response.dto.js";
import type { UpdateDotaProfileDto } from "../dto/update-dota-profile.dto.js";
import { buildConfirmerKey } from "../lib/confirmer-key.js";
import { EntityAttributesRepository } from "../repositories/entity-attributes.repository.js";
import { EntityQualityConfirmationsRepository } from "../repositories/entity-quality-confirmations.repository.js";

interface DotaAttributeInput {
  dotaAccountId?: string;
  gender?: CreateDotaProfileDto["gender"];
  hasMic?: boolean;
  language?: string;
  matchMode?: CreateDotaProfileDto["matchMode"];
  mmr?: string;
  playIntent?: CreateDotaProfileDto["playIntent"];
  roles?: string[];
  server?: string;
}

@Injectable()
export class DotaProfileService {
  constructor(
    private readonly authService: AuthService,
    private readonly entitiesRepository: EntitiesRepository,
    private readonly entityAttributesRepository: EntityAttributesRepository,
    private readonly entityQualityConfirmationsRepository: EntityQualityConfirmationsRepository,
    private readonly friendshipsService: FriendshipsService,
    @Inject(forwardRef(() => GamePartiesRepository))
    private readonly gamePartiesRepository: GamePartiesRepository,
    @Inject(PARTY_REALTIME_PUBLISHER)
    private readonly partyRealtimeService: PartyRealtimePublisher,
    private readonly usersRepository: UsersRepository
  ) {}

  async createGuestProfile(input: CreateDotaProfileDto): Promise<GuestDotaProfileCreateResponseDto> {
    const displayName = input.title?.trim()
      ? input.title.trim()
      : input.dotaAccountId
        ? `Player ${input.dotaAccountId}`
        : await this.resolveDefaultDotaPlayerName(input.title);

    const guest = await this.authService.createGuestAccount(displayName);
    const profile = await this.createProfile(
      {
        ...input,
        title: input.title?.trim() || displayName
      },
      guest.user
    );

    return {
      ...guest.auth,
      profile,
      recoveryToken: guest.recoveryToken,
      recoveryUrl: guest.recoveryUrl
    };
  }

  async createProfile(
    input: CreateDotaProfileDto,
    currentUser: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    const existingProfile = await this.entitiesRepository.findByOwnerUserId(currentUser.id);

    if (existingProfile) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "You already have a Dota profile",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const user = await this.usersRepository.findById(currentUser.id);
    const title = input.dotaAccountId
      ? input.title?.trim() || user?.displayName || `Player ${input.dotaAccountId}`
      : await this.resolveDefaultDotaPlayerName(input.title?.trim() || user?.displayName);
    const baseSlug = input.slug ?? createSlug(user?.username ?? title);
    const slug = await this.createAvailableSlug(baseSlug);

    let entity: Entity;

    try {
      entity = await this.entitiesRepository.create({
        createdBy: currentUser.id,
        ownerUserId: currentUser.id,
        slug,
        title,
        type: "person"
      });
    } catch (error) {
      if (this.entitiesRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Profile slug is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }

    try {
      await this.entityAttributesRepository.upsertMany(entity.id, this.buildAttributeMap(input));
    } catch (error) {
      if (this.entityAttributesRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This Dota Account ID is already linked to another profile",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }

    if (title !== currentUser.displayName) {
      await this.usersRepository.updateDisplayName(currentUser.id, title);
    }

    return this.buildProfileResponse(entity, await this.entityAttributesRepository.findByEntityId(entity.id), {
      isOwner: true,
      viewerUserId: currentUser.id
    });
  }

  async getMyProfile(currentUser: AuthenticatedUser): Promise<DotaProfileResponseDto> {
    const entity = await this.requireOwnedProfile(currentUser.id);
    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, attributes, {
      isOwner: true,
      viewerUserId: currentUser.id
    });
  }

  async listLookingPlayers(input: {
    roles?: string[];
    server?: string;
    viewerUserId?: string;
  }): Promise<DotaLfgListResponseDto> {
    const rows = await this.entityAttributesRepository.listLookingDotaProfiles(20);
    const now = Date.now();
    const blockedPartySlugs = input.viewerUserId
      ? new Set(await this.gamePartiesRepository.listBlockedPartySlugsForUser(input.viewerUserId))
      : new Set<string>();

    const candidates = rows
      .map((row) => {
        const attributes = Object.fromEntries(row.attributes.map((item) => [item.key, item.value]));
        const lfgUntil = attributes[DOTA_ATTRIBUTE_KEYS.lfgUntil];
        const lfgMs = lfgUntil ? Date.parse(lfgUntil) : Number.NaN;

        if (!row.ownerUserId || !Number.isFinite(lfgMs) || lfgMs <= now) {
          return null;
        }

        const roles = parseRoles(attributes[DOTA_ATTRIBUTE_KEYS.roles]);
        const server = attributes[DOTA_ATTRIBUTE_KEYS.server] ?? null;
        const partySlug = attributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim() || null;

        if (partySlug && blockedPartySlugs.has(partySlug)) {
          return null;
        }

        if (input.server && server !== input.server) {
          return null;
        }

        if (input.roles && input.roles.length > 0 && !input.roles.some((role) => roles.includes(role))) {
          return null;
        }

        return {
          desiredSize: parseOptionalPositiveInt(attributes[DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]),
          entityId: row.id,
          memberCount: parseOptionalPositiveInt(attributes[DOTA_ATTRIBUTE_KEYS.lfgMemberCount]),
          mmr: attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
          ownerUserId: row.ownerUserId,
          partyKind: parsePartyKind(attributes[DOTA_ATTRIBUTE_KEYS.lfgPartyKind]),
          partyName: attributes[DOTA_ATTRIBUTE_KEYS.lfgPartyName]?.trim() || null,
          partySlug,
          recruitedRoles: parseRecruitedRoles(attributes[DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]),
          roles,
          server,
          slug: row.slug,
          title: row.title
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    candidates.sort((left, right) => {
      const leftOverlap = input.roles?.filter((role) => left.roles.includes(role)).length ?? 0;
      const rightOverlap = input.roles?.filter((role) => right.roles.includes(role)).length ?? 0;

      if (rightOverlap !== leftOverlap) {
        return rightOverlap - leftOverlap;
      }

      return left.title.localeCompare(right.title);
    });

    const qualityByEntity =
      await this.entityQualityConfirmationsRepository.countByQualityKeyForEntities(
        candidates.map((candidate) => candidate.entityId)
      );

    const results = (
      await Promise.all(
        candidates.map(async (candidate) => {
          const qualities = qualityByEntity[candidate.entityId] ?? {};
          let recruitedRoles = candidate.recruitedRoles;
          let desiredSize = candidate.desiredSize;
          let memberCount = candidate.memberCount;
          let claimedRoles: string[] = [];
          let mmr = candidate.mmr;
          let joinMode: "OPEN" | "CONFIRM" = "OPEN";

          if (candidate.partySlug) {
            const party = await this.gamePartiesRepository.findByVerticalAndSlug(
              DOTA_PARTY_VERTICAL,
              candidate.partySlug
            );
            const partyExpired =
              party != null &&
              party.kind === "PARTY" &&
              party.expiresAt !== null &&
              party.expiresAt.getTime() <= now;

            if (!party || partyExpired) {
              await this.entityAttributesRepository.upsertMany(candidate.entityId, {
                [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgUntil]: new Date(0).toISOString()
              });

              if (party && partyExpired) {
                try {
                  await this.gamePartiesRepository.deleteParty(party.id);
                } catch {
                  // Concurrent cleanup may already have removed it.
                }
              }

              return null;
            }

            joinMode = party.joinMode === "OPEN" ? "OPEN" : "CONFIRM";
            const claimed = new Set(
              party.members
                .map((member) => member.positionRole)
                .filter((role): role is string => Boolean(role))
            );
            claimedRoles = [...claimed].filter(isDotaPositionRole).sort();
            recruitedRoles = candidate.recruitedRoles.filter((role) => !claimed.has(role));
            memberCount = party.members.length;
            desiredSize = Math.min(party.maxMembers, memberCount + recruitedRoles.length);

            const memberMmrs: Array<string | null> = [];

            for (const member of party.members) {
              const dotaEntity = await this.entitiesRepository.findByOwnerUserId(member.userId);
              const attributes = dotaEntity
                ? await this.entityAttributesRepository.findByEntityId(dotaEntity.id)
                : {};
              memberMmrs.push(attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null);
            }

            mmr = averageDotaMmr(memberMmrs) ?? candidate.mmr;

            if (recruitedRoles.length === 0 || memberCount >= party.maxMembers) {
              await this.entityAttributesRepository.upsertMany(candidate.entityId, {
                [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: "",
                [DOTA_ATTRIBUTE_KEYS.lfgUntil]: new Date(0).toISOString()
              });
              return null;
            }
          }

          return {
            claimedRoles,
            desiredSize,
            greenFlags: pickTopFlags(qualities, isDotaGreenFlagKey),
            joinMode,
            memberCount,
            mmr,
            ownerUserId: candidate.ownerUserId,
            partyKind: candidate.partyKind,
            partyName: candidate.partyName,
            partySlug: candidate.partySlug,
            recruitedRoles,
            redFlags: pickTopFlags(qualities, isDotaRedFlagKey),
            roles: candidate.roles,
            server: candidate.server,
            slug: candidate.slug,
            title: candidate.title
          };
        })
      )
    ).filter((row): row is NonNullable<typeof row> => row !== null);

    return { results };
  }

  async setLooking(
    looking: boolean,
    currentUser: AuthenticatedUser,
    options?: { partySlug?: string; recruitedRoles?: string[] }
  ): Promise<DotaProfileResponseDto> {
    const partySlug = options?.partySlug?.trim() || "";

    // Party recruit: write LFG attrs on the captain's profile so one card exists
    // even when a sub-captain toggles looking (idempotent last-write-wins).
    if (partySlug) {
      return this.setPartyRecruitLooking(looking, currentUser, partySlug, options?.recruitedRoles);
    }

    const entity = await this.requireOwnedProfile(currentUser.id);
    const currentAttributes = await this.entityAttributesRepository.findByEntityId(entity.id);
    const previousPartySlug = currentAttributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim() || "";
    const broadcastSlug = previousPartySlug;

    let recruitAttributes: Record<string, string> = {
      [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: ""
    };

    if (looking && options?.recruitedRoles?.length) {
      const recruitedRoles = [...new Set(options.recruitedRoles.filter(isDotaPositionRole))];
      recruitAttributes = {
        ...recruitAttributes,
        [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: String(
          Math.min(DOTA_PARTY_SIZE, Math.max(1, recruitedRoles.length))
        ),
        [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: recruitedRoles.join(",")
      };
    }

    await this.entityAttributesRepository.upsertMany(entity.id, {
      [DOTA_ATTRIBUTE_KEYS.lfgUntil]: looking
        ? new Date(Date.now() + DOTA_LFG_TTL_SECONDS * 1000).toISOString()
        : new Date(0).toISOString(),
      [DOTA_ATTRIBUTE_KEYS.vertical]: DOTA_VERTICAL,
      ...recruitAttributes
    });

    if (broadcastSlug) {
      const party = await this.gamePartiesRepository.findByVerticalAndSlug(
        DOTA_PARTY_VERTICAL,
        broadcastSlug
      );

      this.partyRealtimeService.broadcastPartyRecruitUpdated({
        looking: false,
        ...(party?.id ? { partyId: party.id } : {}),
        partySlug: broadcastSlug,
        recruitedRoles: []
      });
    }

    const nextAttributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, nextAttributes, {
      isOwner: true,
      viewerUserId: currentUser.id
    });
  }

  /**
   * Merge role toggles when possible: if the party is already recruiting the same
   * slug, keep previously open roles that are still unclaimed unless the client
   * sent an explicit role set (always the case today). Last-write-wins on the
   * full set is fine for same-button retries; concurrent different role sets
   * still race — mitigated by realtime broadcast so UIs converge.
   */
  private async setPartyRecruitLooking(
    looking: boolean,
    currentUser: AuthenticatedUser,
    partySlug: string,
    recruitedRolesInput?: string[]
  ): Promise<DotaProfileResponseDto> {
    const party = await this.gamePartiesRepository.findByVerticalAndSlug(
      DOTA_PARTY_VERTICAL,
      partySlug
    );

    if (!party || (party.expiresAt && party.expiresAt.getTime() <= Date.now())) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Team was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const isManager =
      party.ownerUserId === currentUser.id ||
      party.members.some(
        (member) => member.userId === currentUser.id && member.role === "OFFICER"
      );

    if (!isManager) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only the captain or a sub-captain can search on behalf of this party",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const ownerEntity = await this.entitiesRepository.findByOwnerUserId(party.ownerUserId);

    if (!ownerEntity) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Captain needs a Dota profile to recruit",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const ownerAttributes = await this.entityAttributesRepository.findByEntityId(ownerEntity.id);
    const previousPartySlug = ownerAttributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim() || "";

    let recruitAttributes: Record<string, string> = {
      [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
      [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: ""
    };

    if (looking) {
      const memberCount = party.members.length;
      const maxMembers = party.maxMembers;
      const claimed = new Set(
        party.members
          .map((member) => member.positionRole)
          .filter((role): role is string => Boolean(role))
      );
      const explicitRoles = [
        ...new Set((recruitedRolesInput ?? []).filter(isDotaPositionRole))
      ].filter((role) => !claimed.has(role));
      // No roles selected → recruit for every unfilled position slot.
      const recruitedRoles =
        explicitRoles.length > 0
          ? explicitRoles
          : DOTA_POSITION_ROLES.filter((role) => !claimed.has(role));

      if (recruitedRoles.length === 0) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "No open roles left to recruit",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      if (memberCount >= maxMembers) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "This team is already full",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      const desiredSize = Math.min(maxMembers, memberCount + recruitedRoles.length);

      recruitAttributes = {
        [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: String(desiredSize),
        [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: String(maxMembers),
        [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: String(memberCount),
        [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: party.kind,
        [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: party.name,
        [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: party.slug,
        [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: recruitedRoles.join(",")
      };
    }

    await this.entityAttributesRepository.upsertMany(ownerEntity.id, {
      [DOTA_ATTRIBUTE_KEYS.lfgUntil]: looking
        ? new Date(Date.now() + DOTA_LFG_TTL_SECONDS * 1000).toISOString()
        : new Date(0).toISOString(),
      [DOTA_ATTRIBUTE_KEYS.vertical]: DOTA_VERTICAL,
      ...recruitAttributes
    });

    const recruitedRoles = looking
      ? parseRecruitedRoles(recruitAttributes[DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles])
      : [];

    this.partyRealtimeService.broadcastPartyRecruitUpdated({
      looking: looking && recruitedRoles.length > 0,
      partyId: party.id,
      partySlug: party.slug,
      recruitedRoles
    });

    // If owner profile was recruiting a different party, notify that room too.
    if (previousPartySlug && previousPartySlug !== party.slug) {
      const previousParty = await this.gamePartiesRepository.findByVerticalAndSlug(
        DOTA_PARTY_VERTICAL,
        previousPartySlug
      );
      this.partyRealtimeService.broadcastPartyRecruitUpdated({
        looking: false,
        ...(previousParty?.id ? { partyId: previousParty.id } : {}),
        partySlug: previousPartySlug,
        recruitedRoles: []
      });
    }

    const callerEntity = await this.entitiesRepository.findByOwnerUserId(currentUser.id);

    if (callerEntity) {
      const callerAttributes = await this.entityAttributesRepository.findByEntityId(callerEntity.id);
      return this.buildProfileResponse(callerEntity, callerAttributes, {
        isOwner: true,
        viewerUserId: currentUser.id
      });
    }

    const nextOwnerAttributes = await this.entityAttributesRepository.findByEntityId(ownerEntity.id);
    return this.buildProfileResponse(ownerEntity, nextOwnerAttributes, {
      isOwner: party.ownerUserId === currentUser.id,
      viewerUserId: currentUser.id
    });
  }

  async updateMyProfile(
    input: UpdateDotaProfileDto,
    currentUser: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    const entity = await this.requireOwnedProfile(currentUser.id);
    const currentAttributes = await this.entityAttributesRepository.findByEntityId(entity.id);
    const nextAttributes = this.mergeAttributes(currentAttributes, input);

    if (input.dotaAccountId && input.dotaAccountId !== currentAttributes[DOTA_ATTRIBUTE_KEYS.dotaAccountId]) {
      const existingEntityId = await this.entityAttributesRepository.findEntityIdByDotaAccountId(
        input.dotaAccountId
      );

      if (existingEntityId && existingEntityId !== entity.id) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This Dota Account ID is already linked to another profile",
          statusCode: HttpStatus.CONFLICT
        });
      }
    }

    let updatedEntity = entity;
    const nextTitle = input.title?.trim();

    if (nextTitle && nextTitle !== entity.title) {
      updatedEntity = await this.entitiesRepository.updateTitle(entity.id, nextTitle);

      // Keep Opinia account name in sync — parties/friends UI use user.displayName.
      if (nextTitle !== currentUser.displayName) {
        await this.usersRepository.updateDisplayName(currentUser.id, nextTitle);
      }
    }

    try {
      await this.entityAttributesRepository.upsertMany(entity.id, nextAttributes);
    } catch (error) {
      if (this.entityAttributesRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "This Dota Account ID is already linked to another profile",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }

    return this.buildProfileResponse(updatedEntity, { ...currentAttributes, ...nextAttributes }, {
      isOwner: true,
      viewerUserId: currentUser.id
    });
  }

  async getPublicProfileBySlug(slug: string, viewerUserId?: string): Promise<DotaProfileResponseDto> {
    const entity = await this.requireDotaProfileBySlug(slug);
    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, attributes, {
      isOwner: viewerUserId === entity.ownerUserId,
      ...(viewerUserId ? { viewerUserId } : {})
    });
  }

  async getPublicProfileByAccountId(
    accountId: string,
    viewerUserId?: string
  ): Promise<DotaProfileResponseDto> {
    const entityId = await this.entityAttributesRepository.findEntityIdByDotaAccountId(accountId);

    if (!entityId) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const entity = await this.entitiesRepository.findById(entityId);

    if (!entity || entity.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    await this.assertDotaVertical(entity.id);
    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, attributes, {
      isOwner: viewerUserId === entity.ownerUserId,
      ...(viewerUserId ? { viewerUserId } : {})
    });
  }

  async getPublicProfileByUsername(
    username: string,
    viewerUserId?: string
  ): Promise<DotaProfileResponseDto> {
    const user = await this.usersRepository.findByUsernameInsensitive(username);

    if (!user) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const entity = await this.entitiesRepository.findByOwnerUserId(user.id);

    if (!entity || entity.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    await this.assertDotaVertical(entity.id);
    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, attributes, {
      isOwner: viewerUserId === entity.ownerUserId,
      ...(viewerUserId ? { viewerUserId } : {})
    });
  }

  async searchProfiles(query: string): Promise<DotaProfileSearchResponseDto> {
    const normalizedQuery = query.trim();
    const matchingUsers = await this.usersRepository.searchByUsernameOrDisplayName(
      normalizedQuery,
      12
    );
    const entities = await this.entityAttributesRepository.searchDotaProfiles(
      normalizedQuery,
      matchingUsers.map((user) => user.id),
      8
    );
    const usersById = new Map(matchingUsers.map((user) => [user.id, user]));
    const missingOwnerIds = [
      ...new Set(
        entities
          .map((entity) => entity.ownerUserId)
          .filter((ownerUserId): ownerUserId is string => Boolean(ownerUserId))
          .filter((ownerUserId) => !usersById.has(ownerUserId))
      )
    ];

    if (missingOwnerIds.length > 0) {
      const owners = await this.usersRepository.findByIds(missingOwnerIds);
      for (const owner of owners) {
        usersById.set(owner.id, owner);
      }
    }

    return {
      query: normalizedQuery,
      results: entities.map((entity) => {
        const attributeMap = Object.fromEntries(
          entity.attributes.map((attribute) => [attribute.key, attribute.value])
        );
        const owner = entity.ownerUserId ? usersById.get(entity.ownerUserId) : undefined;

        return {
          dotaAccountId: attributeMap[DOTA_ATTRIBUTE_KEYS.dotaAccountId] ?? "",
          entityId: entity.id,
          mmr: attributeMap[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
          slug: entity.slug,
          title: entity.title,
          username: owner?.username ?? null
        };
      })
    };
  }

  async confirmQualities(
    slug: string,
    input: ConfirmDotaQualitiesDto,
    request: RequestLike,
    currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    const entity = await this.requireDotaProfileBySlug(slug);

    if (currentUser && entity.ownerUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "You cannot confirm your own profile",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const qualityKeys = [...new Set(input.qualityKeys)].filter(isDotaConfirmationKey);

    if (qualityKeys.length === 0) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "At least one valid quality key is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const confirmerKey = buildConfirmerKey(input.visitorId, request, currentUser?.id);
    const existingKeys = await this.entityQualityConfirmationsRepository.listConfirmerQualityKeys(
      entity.id,
      confirmerKey
    );
    const nextKeys = [...new Set([...existingKeys, ...qualityKeys])];
    const greenCount = nextKeys.filter(isDotaGreenFlagKey).length;
    const redCount = nextKeys.filter(isDotaRedFlagKey).length;

    if (greenCount > DOTA_FLAG_LIMIT_PER_SIDE || redCount > DOTA_FLAG_LIMIT_PER_SIDE) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: `You can confirm at most ${DOTA_FLAG_LIMIT_PER_SIDE} green and ${DOTA_FLAG_LIMIT_PER_SIDE} red flags`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    await this.entityQualityConfirmationsRepository.upsertConfirmations({
      confirmerKey,
      entityId: entity.id,
      qualityKeys,
      voterUserId: currentUser?.id ?? null
    });

    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, attributes, {
      isOwner: currentUser?.id === entity.ownerUserId,
      ...(currentUser?.id ? { viewerUserId: currentUser.id } : {})
    });
  }

  async revokeQuality(
    slug: string,
    input: ConfirmDotaQualitiesDto,
    request: RequestLike,
    currentUser?: AuthenticatedUser
  ): Promise<DotaProfileResponseDto> {
    const entity = await this.requireDotaProfileBySlug(slug);

    if (currentUser && entity.ownerUserId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "You cannot confirm your own profile",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const qualityKeys = [...new Set(input.qualityKeys)].filter(isDotaConfirmationKey);

    if (qualityKeys.length === 0) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "At least one valid quality key is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const confirmerKey = buildConfirmerKey(input.visitorId, request, currentUser?.id);

    await Promise.all(
      qualityKeys.map((qualityKey) =>
        this.entityQualityConfirmationsRepository.deleteConfirmation({
          confirmerKey,
          entityId: entity.id,
          qualityKey
        })
      )
    );

    const attributes = await this.entityAttributesRepository.findByEntityId(entity.id);

    return this.buildProfileResponse(entity, attributes, {
      isOwner: currentUser?.id === entity.ownerUserId,
      ...(currentUser?.id ? { viewerUserId: currentUser.id } : {})
    });
  }

  private async requireOwnedProfile(userId: string): Promise<Entity> {
    const entity = await this.entitiesRepository.findByOwnerUserId(userId);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    await this.assertDotaVertical(entity.id);

    return entity;
  }

  private async requireDotaProfileBySlug(slug: string): Promise<Entity> {
    const entity = await this.entitiesRepository.findBySlug(slug.trim().toLowerCase());

    if (!entity || entity.visibility !== "ACTIVE" || entity.type !== "person") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    await this.assertDotaVertical(entity.id);

    return entity;
  }

  private async assertDotaVertical(entityId: string): Promise<void> {
    const attributes = await this.entityAttributesRepository.findByEntityId(entityId);

    if (attributes[DOTA_ATTRIBUTE_KEYS.vertical] !== DOTA_VERTICAL) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Dota profile was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
  }

  private buildAttributeMap(input: DotaAttributeInput): Record<string, string> {
    const attributes: Record<string, string> = {
      [DOTA_ATTRIBUTE_KEYS.vertical]: DOTA_VERTICAL
    };

    if (input.dotaAccountId) {
      attributes[DOTA_ATTRIBUTE_KEYS.dotaAccountId] = input.dotaAccountId.trim();
    }

    if (input.mmr) {
      attributes[DOTA_ATTRIBUTE_KEYS.mmr] = input.mmr.trim();
    }

    if (input.roles?.length) {
      attributes[DOTA_ATTRIBUTE_KEYS.roles] = JSON.stringify([...new Set(input.roles)]);
    }

    if (input.server) {
      attributes[DOTA_ATTRIBUTE_KEYS.server] = input.server.trim().toUpperCase();
    }

    if (input.language) {
      attributes[DOTA_ATTRIBUTE_KEYS.language] = input.language.trim().toLowerCase();
    }

    if (input.gender) {
      attributes[DOTA_ATTRIBUTE_KEYS.gender] = input.gender;
    }

    if (typeof input.hasMic === "boolean") {
      attributes[DOTA_ATTRIBUTE_KEYS.hasMic] = String(input.hasMic);
    }

    if (input.playIntent) {
      attributes[DOTA_ATTRIBUTE_KEYS.playIntent] = input.playIntent;
    }

    if (input.matchMode) {
      attributes[DOTA_ATTRIBUTE_KEYS.matchMode] = input.matchMode;
    }

    return attributes;
  }

  private mergeAttributes(
    currentAttributes: Record<string, string>,
    input: UpdateDotaProfileDto
  ): Record<string, string> {
    const mergedInput: DotaAttributeInput = { ...input };
    const currentDotaAccountId = currentAttributes[DOTA_ATTRIBUTE_KEYS.dotaAccountId];

    if (mergedInput.dotaAccountId === undefined && currentDotaAccountId) {
      mergedInput.dotaAccountId = currentDotaAccountId;
    }

    const next = this.buildAttributeMap(mergedInput);

    const roles = currentAttributes[DOTA_ATTRIBUTE_KEYS.roles];
    if (!input.roles && roles) {
      next[DOTA_ATTRIBUTE_KEYS.roles] = roles;
    }

    const gender = currentAttributes[DOTA_ATTRIBUTE_KEYS.gender];
    if (input.gender === undefined && gender) {
      next[DOTA_ATTRIBUTE_KEYS.gender] = gender;
    }

    const hasMic = currentAttributes[DOTA_ATTRIBUTE_KEYS.hasMic];
    if (input.hasMic === undefined && hasMic) {
      next[DOTA_ATTRIBUTE_KEYS.hasMic] = hasMic;
    }

    const playIntent = currentAttributes[DOTA_ATTRIBUTE_KEYS.playIntent];
    if (input.playIntent === undefined && playIntent) {
      next[DOTA_ATTRIBUTE_KEYS.playIntent] = playIntent;
    }

    const matchMode = currentAttributes[DOTA_ATTRIBUTE_KEYS.matchMode];
    if (input.matchMode === undefined && matchMode) {
      next[DOTA_ATTRIBUTE_KEYS.matchMode] = matchMode;
    }

    return next;
  }

  private async buildProfileResponse(
    entity: Entity,
    attributes: Record<string, string>,
    options: { isOwner: boolean; viewerUserId?: string }
  ): Promise<DotaProfileResponseDto> {
    const [qualities, distinctConfirmers, friendship] = await Promise.all([
      this.entityQualityConfirmationsRepository.countByQualityKey(entity.id),
      this.entityQualityConfirmationsRepository.countDistinctConfirmers(entity.id),
      this.friendshipsService.getStatusDetails(options.viewerUserId, entity.ownerUserId)
    ]);

    return {
      dotaAccountId: attributes[DOTA_ATTRIBUTE_KEYS.dotaAccountId] ?? "",
      entityId: entity.id,
      friendshipRequestId: friendship.requestId,
      friendshipStatus: friendship.status,
      gender: attributes[DOTA_ATTRIBUTE_KEYS.gender] ?? null,
      hasMic: parseOptionalBoolean(attributes[DOTA_ATTRIBUTE_KEYS.hasMic]),
      isOwner: options.isOwner,
      language: attributes[DOTA_ATTRIBUTE_KEYS.language] ?? null,
      mmr: attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
      ownerUserId: entity.ownerUserId,
      playIntent: attributes[DOTA_ATTRIBUTE_KEYS.playIntent] ?? null,
      matchMode: (() => {
        const value = attributes[DOTA_ATTRIBUTE_KEYS.matchMode];
        return value && isDotaMatchMode(value) ? value : null;
      })(),
      progress: {
        current: distinctConfirmers,
        target: DOTA_CONFIRMATION_MILESTONE
      },
      qualities,
      roles: parseRoles(attributes[DOTA_ATTRIBUTE_KEYS.roles]),
      server: attributes[DOTA_ATTRIBUTE_KEYS.server] ?? null,
      slug: entity.slug,
      title: entity.title
    };
  }

  private async createAvailableSlug(baseSlug: string): Promise<string> {
    for (let index = 0; index < 10; index += 1) {
      const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`.slice(0, 120);
      const existingEntity = await this.entitiesRepository.findBySlug(candidate);

      if (!existingEntity) {
        return candidate;
      }
    }

    return `${baseSlug.slice(0, 111)}-${Date.now().toString(36)}`;
  }

  private async resolveDefaultDotaPlayerName(candidate?: string | null): Promise<string> {
    const trimmed = candidate?.trim() ?? "";

    if (trimmed && !isBareDefaultDotaPlayerName(trimmed)) {
      return trimmed;
    }

    return this.entitiesRepository.nextDefaultDotaPlayerTitle();
  }
}

function isBareDefaultDotaPlayerName(value: string): boolean {
  return /^dota player$/i.test(value.trim());
}

function parseRoles(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

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

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePartyKind(value: string | undefined): "TEAM" | "PARTY" | null {
  if (value === "TEAM" || value === "PARTY") {
    return value;
  }

  return null;
}

function averageDotaMmr(values: Array<string | null | undefined>): string | null {
  const numbers: number[] = [];

  for (const value of values) {
    if (!value?.trim()) {
      continue;
    }

    if (value.includes("-")) {
      const [fromRaw = "", toRaw = ""] = value.split("-");
      const from = Number.parseInt(fromRaw.trim(), 10);
      const to = Number.parseInt(toRaw.trim(), 10);

      if (Number.isFinite(from) && Number.isFinite(to)) {
        numbers.push((from + to) / 2);
      }

      continue;
    }

    const parsed = Number.parseInt(value.trim(), 10);

    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
    }
  }

  if (numbers.length === 0) {
    return null;
  }

  return String(Math.round(numbers.reduce((sum, item) => sum + item, 0) / numbers.length));
}

const LFG_FLAG_LIMIT = 3;

function pickTopFlags(
  qualities: Record<string, number>,
  matches: (key: string) => boolean
): Array<{ count: number; key: string }> {
  return Object.entries(qualities)
    .filter(([key, count]) => matches(key) && count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, LFG_FLAG_LIMIT)
    .map(([key, count]) => ({ count, key }));
}
