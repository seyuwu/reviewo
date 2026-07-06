import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Entity } from "#prisma/client";
import { EntityType, EntityVisibility } from "#prisma/client";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { CreateEntityDto } from "../dto/create-entity.dto.js";
import { EntityDto } from "../dto/entity.dto.js";
import type { RankedSearchEntityDto } from "../dto/ranked-search-entity.dto.js";
import { TrustCheckResponseDto } from "../dto/trust-check-response.dto.js";
import { createEntityCreatedEvent } from "../events/entity-created.event.js";
import type { EnsureEntityForUrlInput } from "../interfaces/ensure-entity-for-url.js";
import type { EnsureEntityForUrlResult } from "../interfaces/ensure-entity-for-url.js";
import type { EntitiesPort } from "../interfaces/entities.port.js";
import type { ResolveEntityByUrlResult } from "../interfaces/entities.port.js";
import { URL_NORMALIZER } from "../interfaces/url-normalizer.js";
import type { UrlNormalizer } from "../interfaces/url-normalizer.js";
import type { CreateEntityRecordInput } from "../repositories/entities.repository.js";
import { EntitiesRepository } from "../repositories/entities.repository.js";
import { createSlug, createSlugFromCanonicalUrl } from "./entity-slug.js";
import { sanitizeLazyEntityTitle, isGenericLazyEntityTitle } from "./lazy-entity-title.js";
import { rankSearchResults, collectCanonicalRootLookupUrls } from "./search-ranking.js";

@Injectable()
export class EntitiesService implements EntitiesPort {
  constructor(
    private readonly entitiesRepository: EntitiesRepository,
    private readonly domainEventBus: DomainEventBus,
    @Inject(URL_NORMALIZER)
    private readonly urlNormalizer: UrlNormalizer
  ) {}

  async createEntity(input: CreateEntityDto, currentUser: AuthenticatedUser): Promise<EntityDto> {
    if (input.parentId) {
      const parent = await this.entitiesRepository.findById(input.parentId);

      if (!parent) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Parent entity was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }
    }

    const baseSlug = input.slug ?? createSlug(input.title);
    const slug = await this.createAvailableSlug(baseSlug);
    const canonicalUrl = this.normalizeCanonicalUrl(input.canonicalUrl);
    const description = normalizeOptionalString(input.description);

    try {
      const recordInput: CreateEntityRecordInput = {
        createdBy: currentUser.id,
        slug,
        title: input.title.trim(),
        type: input.type
      };

      if (canonicalUrl) {
        const existingEntity = await this.entitiesRepository.findByCanonicalUrl(canonicalUrl);

        if (existingEntity) {
          throw createAppException({
            code: AppErrorCode.Conflict,
            details: {
              entityId: existingEntity.id
            },
            message: "Entity with this canonical URL already exists",
            statusCode: HttpStatus.CONFLICT
          });
        }

        recordInput.canonicalUrl = canonicalUrl;
      }

      if (description) {
        recordInput.description = description;
      }

      if (input.parentId) {
        recordInput.parentId = input.parentId;
      }

      const entity = await this.entitiesRepository.create(recordInput);
      const entityDto = toEntityDto(entity);

      await this.domainEventBus.publish(
        createEntityCreatedEvent({
          createdBy: entity.createdBy,
          entityId: entityDto.id,
          type: entityDto.type
        })
      );

      return entityDto;
    } catch (error) {
      if (this.entitiesRepository.isUniqueConstraintError(error)) {
        const existingEntity =
          (await this.entitiesRepository.findBySlug(slug)) ??
          (canonicalUrl ? await this.entitiesRepository.findByCanonicalUrl(canonicalUrl) : null);

        throw createAppException({
          code: AppErrorCode.Conflict,
          details: existingEntity
            ? {
                entityId: existingEntity.id
              }
            : undefined,
          message: existingEntity?.canonicalUrl
            ? "Entity with this canonical URL already exists"
            : "Entity with this slug or canonical URL already exists",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }
  }

  async findEntityById(id: string): Promise<EntityDto | null> {
    const entity = await this.entitiesRepository.findById(id);

    if (!entity || entity.visibility !== EntityVisibility.ACTIVE) {
      return null;
    }

    return toEntityDto(entity);
  }

  async findEntityBySlug(slug: string): Promise<EntityDto | null> {
    const entity = await this.entitiesRepository.findBySlug(slug.trim().toLowerCase());

    if (!entity || entity.visibility !== EntityVisibility.ACTIVE) {
      return null;
    }

    return toEntityDto(entity);
  }

  async hideEntity(entityId: string): Promise<EntityDto> {
    const entity = await this.entitiesRepository.findById(entityId);

    if (!entity) {
      throw createEntityNotFoundException();
    }

    if (entity.visibility === EntityVisibility.HIDDEN) {
      return toEntityDto(entity);
    }

    const updatedEntity = await this.entitiesRepository.updateVisibility(
      entityId,
      EntityVisibility.HIDDEN
    );

    return toEntityDto(updatedEntity);
  }

  async unhideEntity(entityId: string): Promise<EntityDto> {
    const entity = await this.entitiesRepository.findById(entityId);

    if (!entity) {
      throw createEntityNotFoundException();
    }

    if (entity.visibility === EntityVisibility.ACTIVE) {
      return toEntityDto(entity);
    }

    const updatedEntity = await this.entitiesRepository.updateVisibility(
      entityId,
      EntityVisibility.ACTIVE
    );

    return toEntityDto(updatedEntity);
  }

  async resolveEntityByUrl(url: string): Promise<ResolveEntityByUrlResult> {
    const canonicalUrl = this.urlNormalizer.normalize(url);

    if (!canonicalUrl) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "URL must be a valid HTTP or HTTPS URL",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const entity = await this.entitiesRepository.findByCanonicalUrl(canonicalUrl);

    if (!entity) {
      return {
        canonicalUrl,
        entity: null,
        inputUrl: url.trim(),
        resolution: "not_found"
      };
    }

    if (entity.visibility === EntityVisibility.HIDDEN) {
      return {
        canonicalUrl,
        entity: null,
        inputUrl: url.trim(),
        resolution: "hidden"
      };
    }

    return {
      canonicalUrl,
      entity: toEntityDto(entity),
      inputUrl: url.trim(),
      resolution: "found"
    };
  }

  async trustCheckUrl(url: string): Promise<TrustCheckResponseDto> {
    const resolved = await this.resolveEntityByUrl(url);

    if (resolved.resolution === "hidden") {
      throw createEntityUnavailableException();
    }

    if (resolved.entity) {
      return {
        entity: resolved.entity,
        mode: "existing",
        url: {
          canonical: resolved.canonicalUrl,
          input: resolved.inputUrl
        }
      };
    }

    const entity = await this.createPublicUrlEntity(resolved.canonicalUrl);

    return {
      entity,
      mode: "created",
      url: {
        canonical: resolved.canonicalUrl,
        input: resolved.inputUrl
      }
    };
  }

  private async createPublicUrlEntity(canonicalUrl: string): Promise<EntityDto> {
    const title = sanitizeLazyEntityTitle(undefined, canonicalUrl);
    const slug = await this.createAvailableUrlSlug(canonicalUrl);

    try {
      const entity = await this.entitiesRepository.create({
        canonicalUrl,
        createdBy: null,
        slug,
        title,
        type: EntityType.website
      });
      const entityDto = toEntityDto(entity);

      await this.domainEventBus.publish(
        createEntityCreatedEvent({
          createdBy: entity.createdBy,
          entityId: entityDto.id,
          type: entityDto.type
        })
      );

      return entityDto;
    } catch (error) {
      if (this.entitiesRepository.isUniqueConstraintError(error)) {
        const existingEntity = await this.entitiesRepository.findByCanonicalUrl(canonicalUrl);

        if (existingEntity && existingEntity.visibility === EntityVisibility.ACTIVE) {
          return toEntityDto(existingEntity);
        }
      }

      throw error;
    }
  }

  private async createAvailableUrlSlug(canonicalUrl: string): Promise<string> {
    return this.createAvailableSlug(createSlugFromCanonicalUrl(canonicalUrl));
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

  async ensureEntityForUrl(
    url: string,
    input: EnsureEntityForUrlInput,
    currentUser: AuthenticatedUser
  ): Promise<EnsureEntityForUrlResult> {
    const resolved = await this.resolveEntityByUrl(url);

    if (resolved.resolution === "hidden") {
      throw createEntityUnavailableException();
    }

    if (resolved.entity) {
      const upgradedEntity = await this.upgradeGenericEntityTitleIfNeeded(
        resolved.entity,
        input.sourceTitle,
        resolved.canonicalUrl
      );

      return {
        entity: upgradedEntity,
        mode: "existing"
      };
    }

    const title = sanitizeLazyEntityTitle(input.sourceTitle, resolved.canonicalUrl);
    const slug = createSlugFromCanonicalUrl(resolved.canonicalUrl);

    try {
      const siteRootCanonicalUrl = this.urlNormalizer.getSiteRootCanonicalUrl(resolved.canonicalUrl);
      const parentId =
        siteRootCanonicalUrl !== resolved.canonicalUrl
          ? (await this.entitiesRepository.findByCanonicalUrl(siteRootCanonicalUrl))?.id
          : undefined;

      const entity = await this.entitiesRepository.create({
        canonicalUrl: resolved.canonicalUrl,
        createdBy: currentUser.id,
        slug,
        title,
        type: EntityType.website,
        ...(parentId ? { parentId } : {})
      });
      const entityDto = toEntityDto(entity);

      await this.domainEventBus.publish(
        createEntityCreatedEvent({
          createdBy: entity.createdBy,
          entityId: entityDto.id,
          type: entityDto.type
        })
      );

      return {
        entity: entityDto,
        mode: "created"
      };
    } catch (error) {
      if (this.entitiesRepository.isUniqueConstraintError(error)) {
        const existingEntity = await this.entitiesRepository.findByCanonicalUrl(
          resolved.canonicalUrl
        );

        if (existingEntity) {
          if (existingEntity.visibility === EntityVisibility.HIDDEN) {
            throw createEntityUnavailableException();
          }

          return {
            entity: toEntityDto(existingEntity),
            mode: "existing"
          };
        }
      }

      throw error;
    }
  }

  private async upgradeGenericEntityTitleIfNeeded(
    entity: EntityDto,
    sourceTitle: string | undefined,
    canonicalUrl: string
  ): Promise<EntityDto> {
    if (!sourceTitle?.trim()) {
      return entity;
    }

    const nextTitle = sanitizeLazyEntityTitle(sourceTitle, canonicalUrl);

    if (
      !isGenericLazyEntityTitle(entity.title, canonicalUrl) ||
      isGenericLazyEntityTitle(nextTitle, canonicalUrl)
    ) {
      return entity;
    }

    const updatedEntity = await this.entitiesRepository.updateTitle(entity.id, nextTitle);

    return toEntityDto(updatedEntity);
  }

  async getEntityById(id: string): Promise<EntityDto> {
    const entity = await this.findEntityById(id);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return entity;
  }

  async listChildEntities(parentId: string, limit: number): Promise<EntityDto[]> {
    const parent = await this.entitiesRepository.findById(parentId);

    if (!parent || parent.visibility !== EntityVisibility.ACTIVE) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const children = await this.entitiesRepository.findChildrenByParentId(parentId, limit);

    return children.map(toEntityDto);
  }

  async searchEntities(query: string): Promise<EntityDto[]> {
    const rankedRows = await this.performRankedSearch(query);

    return rankedRows.map(({ entity }) => toEntityDto(entity));
  }

  async searchEntitiesRanked(query: string): Promise<RankedSearchEntityDto[]> {
    const rankedRows = await this.performRankedSearch(query);

    return rankedRows.map(({ entity, ranking }) => toRankedSearchEntityDto(entity, ranking));
  }

  private async performRankedSearch(query: string): Promise<RankedSearchRow[]> {
    const normalizedQuery = query.trim();
    const normalizedUrl = this.urlNormalizer.normalize(normalizedQuery);

    if (normalizedUrl) {
      const entity = await this.entitiesRepository.findByCanonicalUrl(normalizedUrl);

      if (entity && entity.visibility === EntityVisibility.ACTIVE) {
        const metricsByEntityId = await this.entitiesRepository.getSearchMetricsByEntityIds([
          entity.id
        ]);
        const metrics = metricsByEntityId.get(entity.id) ?? {
          avgScore: null,
          reviewsCount: 0,
          votesCount: 0
        };
        const isSiteRoot =
          this.urlNormalizer.getSiteRootCanonicalUrl(normalizedUrl) === entity.canonicalUrl;

        return [
          {
            entity,
            ranking: {
              avgScore: metrics.avgScore,
              resultKind: isSiteRoot ? "canonical_site" : "entity",
              reviewsCount: metrics.reviewsCount,
              votesCount: metrics.votesCount
            }
          }
        ];
      }

      return [];
    }

    const entities = await this.entitiesRepository.search(normalizedQuery);
    const canonicalLookupMap = await this.loadCanonicalRootLookupMap(normalizedQuery);
    const entityById = new Map<string, Entity>();

    for (const entity of entities) {
      entityById.set(entity.id, entity);
    }

    for (const entity of canonicalLookupMap.values()) {
      entityById.set(entity.id, entity);
    }

    const entityIds = [...entityById.keys()];
    const metricsByEntityId = await this.entitiesRepository.getSearchMetricsByEntityIds(entityIds);
    const rankedEntities = rankSearchResults(
      entities,
      normalizedQuery,
      metricsByEntityId,
      this.urlNormalizer,
      (canonicalUrl) => canonicalLookupMap.get(canonicalUrl) ?? null
    );

    return rankedEntities.map((rankedEntity) => {
      const entity = entityById.get(rankedEntity.id);

      if (!entity) {
        throw createAppException({
          code: AppErrorCode.NotFound,
          message: "Entity was not found",
          statusCode: HttpStatus.NOT_FOUND
        });
      }

      return {
        entity,
        ranking: {
          avgScore: rankedEntity.avgScore,
          resultKind: rankedEntity.resultKind,
          reviewsCount: rankedEntity.reviewsCount,
          votesCount: rankedEntity.votesCount
        }
      };
    });
  }

  private async loadCanonicalRootLookupMap(query: string): Promise<Map<string, Entity>> {
    const canonicalLookupMap = new Map<string, Entity>();

    for (const canonicalUrl of collectCanonicalRootLookupUrls(query, this.urlNormalizer)) {
      const entity = await this.entitiesRepository.findByCanonicalUrl(canonicalUrl);

      if (entity && entity.visibility === EntityVisibility.ACTIVE) {
        canonicalLookupMap.set(canonicalUrl, entity);
      }
    }

    return canonicalLookupMap;
  }

  private normalizeCanonicalUrl(canonicalUrl: string | undefined): string | undefined {
    if (!canonicalUrl) {
      return undefined;
    }

    const normalizedUrl = this.urlNormalizer.normalize(canonicalUrl);

    if (!normalizedUrl) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Canonical URL must be a valid HTTP or HTTPS URL",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    return normalizedUrl;
  }
}

function toEntityDto(entity: Entity): EntityDto {
  return {
    canonicalUrl: entity.canonicalUrl,
    createdAt: entity.createdAt.toISOString(),
    description: entity.description,
    id: entity.id,
    parentId: entity.parentId,
    slug: entity.slug,
    title: entity.title,
    type: entity.type,
    updatedAt: entity.updatedAt.toISOString(),
    visibility: entity.visibility
  };
}

function toRankedSearchEntityDto(
  entity: Entity,
  ranking: RankedSearchRanking
): RankedSearchEntityDto {
  return {
    avgScore: ranking.avgScore,
    canonicalUrl: entity.canonicalUrl,
    description: entity.description,
    id: entity.id,
    parentId: entity.parentId,
    resultKind: ranking.resultKind,
    reviewsCount: ranking.reviewsCount,
    slug: entity.slug,
    title: entity.title,
    type: entity.type,
    votesCount: ranking.votesCount
  };
}

interface RankedSearchRanking {
  avgScore: number | null;
  resultKind: RankedSearchEntityDto["resultKind"];
  reviewsCount: number;
  votesCount: number;
}

interface RankedSearchRow {
  entity: Entity;
  ranking: RankedSearchRanking;
}

function createEntityNotFoundException(): Error {
  return createAppException({
    code: AppErrorCode.NotFound,
    message: "Entity was not found",
    statusCode: HttpStatus.NOT_FOUND
  });
}

function createEntityUnavailableException(): Error {
  return createAppException({
    code: AppErrorCode.NotFound,
    message: "This site is not available on Opinia",
    statusCode: HttpStatus.NOT_FOUND
  });
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}
