import { Controller, Get, Query } from "@nestjs/common";

import { SearchEntitiesQueryDto } from "../dto/search-entities-query.dto.js";
import { SearchEntitiesResponseDto } from "../dto/search-entities-response.dto.js";
import { SearchService } from "../services/search.service.js";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("entities")
  async searchEntities(@Query() query: SearchEntitiesQueryDto): Promise<SearchEntitiesResponseDto> {
    return this.searchService.searchEntities(query.query);
  }
}
