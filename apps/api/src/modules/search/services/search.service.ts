import { Inject, Injectable } from "@nestjs/common";

import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";
import {
  SearchEntitiesResponseDto,
  SearchEntityResultDto
} from "../dto/search-entities-response.dto.js";

@Injectable()
export class SearchService {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort
  ) {}

  async searchEntities(query: string): Promise<SearchEntitiesResponseDto> {
    const normalizedQuery = query.trim();
    const entities = await this.entitiesPort.searchEntities(normalizedQuery);

    return {
      canCreateEntity: entities.length === 0,
      query: normalizedQuery,
      results: entities.map(toSearchEntityResultDto)
    };
  }
}

function toSearchEntityResultDto(entity: EntityDto): SearchEntityResultDto {
  return {
    canonicalUrl: entity.canonicalUrl,
    description: entity.description,
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    type: entity.type
  };
}
