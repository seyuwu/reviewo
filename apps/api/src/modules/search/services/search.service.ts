import { Inject, Injectable } from "@nestjs/common";

import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { RankedSearchEntityDto } from "../../entities/dto/ranked-search-entity.dto.js";
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
    const entities = await this.entitiesPort.searchEntitiesRanked(normalizedQuery);

    return {
      canCreateEntity: entities.length === 0,
      query: normalizedQuery,
      results: entities.map(toSearchEntityResultDto)
    };
  }
}

function toSearchEntityResultDto(entity: RankedSearchEntityDto): SearchEntityResultDto {
  return {
    avgScore: entity.avgScore,
    canonicalUrl: entity.canonicalUrl,
    description: entity.description,
    id: entity.id,
    resultKind: entity.resultKind,
    reviewsCount: entity.reviewsCount,
    slug: entity.slug,
    title: entity.title,
    type: entity.type,
    votesCount: entity.votesCount
  };
}
