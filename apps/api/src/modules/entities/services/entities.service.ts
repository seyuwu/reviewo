import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Entity } from "@prisma/client";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { CreateEntityDto } from "../dto/create-entity.dto.js";
import { EntityDto } from "../dto/entity.dto.js";
import { createEntityCreatedEvent } from "../events/entity-created.event.js";
import type { EntitiesPort } from "../interfaces/entities.port.js";
import type { ResolveEntityByUrlResult } from "../interfaces/entities.port.js";
import { URL_NORMALIZER } from "../interfaces/url-normalizer.js";
import type { UrlNormalizer } from "../interfaces/url-normalizer.js";
import type { CreateEntityRecordInput } from "../repositories/entities.repository.js";
import { EntitiesRepository } from "../repositories/entities.repository.js";

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

    const slug = input.slug ?? createSlug(input.title);

    try {
      const recordInput: CreateEntityRecordInput = {
        createdBy: currentUser.id,
        slug,
        title: input.title.trim(),
        type: input.type
      };
      const canonicalUrl = this.normalizeCanonicalUrl(input.canonicalUrl);
      const description = normalizeOptionalString(input.description);

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
          createdBy: entityDto.createdBy,
          entityId: entityDto.id,
          type: entityDto.type
        })
      );

      return entityDto;
    } catch (error) {
      if (this.entitiesRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Entity with this slug or canonical URL already exists",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }
  }

  async findEntityById(id: string): Promise<EntityDto | null> {
    const entity = await this.entitiesRepository.findById(id);

    return entity ? toEntityDto(entity) : null;
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

    return {
      canonicalUrl,
      entity: entity ? toEntityDto(entity) : null,
      inputUrl: url.trim()
    };
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

  async searchEntities(query: string): Promise<EntityDto[]> {
    const normalizedUrl = this.urlNormalizer.normalize(query);

    if (normalizedUrl) {
      const entity = await this.entitiesRepository.findByCanonicalUrl(normalizedUrl);

      if (entity) {
        return [toEntityDto(entity)];
      }

      return [];
    }

    const entities = await this.entitiesRepository.search(query.trim());

    return entities.map(toEntityDto);
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
    createdBy: entity.createdBy,
    description: entity.description,
    id: entity.id,
    parentId: entity.parentId,
    slug: entity.slug,
    title: entity.title,
    type: entity.type,
    updatedAt: entity.updatedAt.toISOString()
  };
}

function createSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return slug || "entity";
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}
