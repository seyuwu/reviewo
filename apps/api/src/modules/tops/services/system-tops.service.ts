import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import type {
  EntitySystemTopsResponseDto,
  SystemTopCatalogResponseDto,
  SystemTopDetailDto,
  SystemTopItemDto
} from "../dto/system-top.dto.js";
import {
  SystemTopsRepository,
  toSnapshotItems
} from "../repositories/system-tops.repository.js";
import {
  getSystemTopDefinition,
  SYSTEM_TOP_DEFINITIONS
} from "../system-top-definitions.js";

@Injectable()
export class SystemTopsService {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    private readonly systemTopsRepository: SystemTopsRepository
  ) {}

  async listCatalog(): Promise<SystemTopCatalogResponseDto> {
    const computedAtBySlug = await this.systemTopsRepository.getLatestComputedAtBySlug();

    return {
      items: SYSTEM_TOP_DEFINITIONS.map((definition) => ({
        computedAt: computedAtBySlug.get(definition.slug)?.toISOString() ?? null,
        description: definition.description,
        slug: definition.slug,
        title: definition.title
      }))
    };
  }

  async getSystemTopBySlug(slug: string): Promise<SystemTopDetailDto> {
    const definition = getSystemTopDefinition(slug);

    if (!definition) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "System top not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const snapshot = await this.systemTopsRepository.getLatestSnapshot(slug);
    const items = snapshot ? await this.mapSnapshotItems(snapshot.items) : [];

    return {
      computedAt: snapshot?.computedAt.toISOString() ?? null,
      description: definition.description,
      items,
      slug: definition.slug,
      sort: definition.sort,
      title: definition.title
    };
  }

  async listSystemTopsForEntity(entityId: string): Promise<EntitySystemTopsResponseDto> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity || entity.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const rows = await this.systemTopsRepository.listEntitySystemTopAppearances(entityId);

    return {
      items: rows.flatMap((row) => {
        const definition = getSystemTopDefinition(row.definitionSlug);

        if (!definition) {
          return [];
        }

        return [
          {
            computedAt: row.computedAt.toISOString(),
            isSystemTop: true as const,
            position: row.position,
            slug: definition.slug,
            title: definition.title
          }
        ];
      })
    };
  }

  async refreshAll(): Promise<{ refreshed: number }> {
    let refreshed = 0;

    for (const definition of SYSTEM_TOP_DEFINITIONS) {
      await this.refreshDefinition(definition.slug);
      refreshed += 1;
    }

    return { refreshed };
  }

  async refreshDefinition(slug: string): Promise<void> {
    const definition = getSystemTopDefinition(slug);

    if (!definition) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "System top not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const rankedRows = await this.systemTopsRepository.computeRankedEntities(definition);
    const snapshotItems = toSnapshotItems(rankedRows);
    const entityTitles = new Map(rankedRows.map((row) => [row.entityId, row.title]));

    await this.systemTopsRepository.insertSnapshot(definition.slug, snapshotItems, entityTitles);
  }

  private async mapSnapshotItems(
    items: Array<{ entityId: string; position: number; score: number }>
  ): Promise<SystemTopItemDto[]> {
    const mapped: SystemTopItemDto[] = [];

    for (const item of items) {
      const entity = await this.entitiesPort.findEntityById(item.entityId);

      if (!entity || entity.visibility !== "ACTIVE") {
        continue;
      }

      let rating = null;

      try {
        rating = await this.ratingsPort.getAggregate(item.entityId);
      } catch {
        rating = null;
      }

      mapped.push({
        avgScore: rating?.avgScore ?? null,
        entity: {
          canonicalUrl: entity.canonicalUrl,
          id: entity.id,
          logoUrl: entity.logoUrl,
          slug: entity.slug,
          title: entity.title,
          type: entity.type
        },
        position: item.position,
        score: item.score,
        votesCount: rating?.votesCount ?? null
      });
    }

    return mapped;
  }
}
