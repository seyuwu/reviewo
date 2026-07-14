import { HttpStatus, Injectable } from "@nestjs/common";
import type { Entity } from "#prisma/client";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_CONFIRMATION_MILESTONE,
  DOTA_FLAG_LIMIT_PER_SIDE,
  DOTA_VERTICAL,
  isDotaConfirmationKey,
  isDotaGreenFlagKey,
  isDotaRedFlagKey
} from "@reviewo/shared";

import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import { createSlug } from "../../entities/services/entity-slug.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import type { ConfirmDotaQualitiesDto } from "../dto/confirm-dota-qualities.dto.js";
import type { CreateDotaProfileDto } from "../dto/create-dota-profile.dto.js";
import type { DotaProfileResponseDto } from "../dto/dota-profile-response.dto.js";
import type { DotaProfileSearchResponseDto } from "../dto/dota-profile-search-response.dto.js";
import type { UpdateDotaProfileDto } from "../dto/update-dota-profile.dto.js";
import { buildConfirmerKey } from "../lib/confirmer-key.js";
import { EntityAttributesRepository } from "../repositories/entity-attributes.repository.js";
import { EntityQualityConfirmationsRepository } from "../repositories/entity-quality-confirmations.repository.js";
import { FriendshipsService } from "../../social/services/friendships.service.js";

interface DotaAttributeInput {
  dotaAccountId?: string;
  hasMic?: boolean;
  language?: string;
  mmr?: string;
  playIntent?: CreateDotaProfileDto["playIntent"];
  roles?: string[];
  server?: string;
}

@Injectable()
export class DotaProfileService {
  constructor(
    private readonly entitiesRepository: EntitiesRepository,
    private readonly entityAttributesRepository: EntityAttributesRepository,
    private readonly entityQualityConfirmationsRepository: EntityQualityConfirmationsRepository,
    private readonly friendshipsService: FriendshipsService,
    private readonly usersRepository: UsersRepository
  ) {}

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
    const title =
      input.title?.trim() ||
      user?.displayName ||
      (input.dotaAccountId ? `Player ${input.dotaAccountId}` : "Dota player");
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

    if (input.title?.trim()) {
      updatedEntity = await this.entitiesRepository.updateTitle(entity.id, input.title.trim());
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

    if (typeof input.hasMic === "boolean") {
      attributes[DOTA_ATTRIBUTE_KEYS.hasMic] = String(input.hasMic);
    }

    if (input.playIntent) {
      attributes[DOTA_ATTRIBUTE_KEYS.playIntent] = input.playIntent;
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

    const hasMic = currentAttributes[DOTA_ATTRIBUTE_KEYS.hasMic];
    if (input.hasMic === undefined && hasMic) {
      next[DOTA_ATTRIBUTE_KEYS.hasMic] = hasMic;
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
      hasMic: parseOptionalBoolean(attributes[DOTA_ATTRIBUTE_KEYS.hasMic]),
      isOwner: options.isOwner,
      language: attributes[DOTA_ATTRIBUTE_KEYS.language] ?? null,
      mmr: attributes[DOTA_ATTRIBUTE_KEYS.mmr] ?? null,
      ownerUserId: entity.ownerUserId,
      playIntent: attributes[DOTA_ATTRIBUTE_KEYS.playIntent] ?? null,
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

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}
