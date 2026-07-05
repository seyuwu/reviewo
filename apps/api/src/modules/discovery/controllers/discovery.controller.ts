import { Controller, Get, Query } from "@nestjs/common";

import type {
  BattlePairListDto,
  DiscoveryEntityRankListDto
} from "../dto/discovery.dto.js";
import {
  DiscoveryLimitQueryDto,
  DiscoveryRatingsRisingQueryDto,
  DiscoveryRatingsTopQueryDto
} from "../dto/discovery-query.dto.js";
import { assertDiscoveryLimit, DiscoveryService } from "../services/discovery.service.js";

@Controller()
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get("growth/battles/active")
  async getActiveBattles(@Query() query: DiscoveryLimitQueryDto): Promise<BattlePairListDto> {
    return this.discoveryService.getActiveBattles(assertDiscoveryLimit(query.limit, 12));
  }

  @Get("growth/battles/suggested")
  async getSuggestedBattles(@Query() query: DiscoveryLimitQueryDto): Promise<BattlePairListDto> {
    return this.discoveryService.getSuggestedBattles(assertDiscoveryLimit(query.limit, 12));
  }

  @Get("discovery/ratings/top")
  async getTopRatings(@Query() query: DiscoveryRatingsTopQueryDto): Promise<DiscoveryEntityRankListDto> {
    return this.discoveryService.getTopRatings(query.window ?? "all", assertDiscoveryLimit(query.limit, 20));
  }

  @Get("discovery/ratings/rising")
  async getRisingRatings(@Query() query: DiscoveryRatingsRisingQueryDto): Promise<DiscoveryEntityRankListDto> {
    return this.discoveryService.getRisingRatings(query.window ?? "day", assertDiscoveryLimit(query.limit, 20));
  }
}
