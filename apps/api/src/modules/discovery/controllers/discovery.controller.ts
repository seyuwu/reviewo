import { Body, Controller, Get, Post, Query } from "@nestjs/common";

import type {
  BattlePairListDto,
  DiscoveryEntityRankListDto,
  DiscussionFeedDto,
  DiscoveryStatsDto,
  RandomBattleDto
} from "../dto/discovery.dto.js";
import {
  DiscoveryBattlesQueryDto,
  DiscoveryLimitQueryDto,
  DiscoveryRatingsRisingQueryDto,
  DiscoveryRatingsTopQueryDto
} from "../dto/discovery-query.dto.js";
import { SitePresenceHeartbeatDto } from "../dto/site-presence-heartbeat.dto.js";
import { assertDiscoveryLimit, DiscoveryService, normalizeTopRatingsSort } from "../services/discovery.service.js";

@Controller()
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get("growth/battles/active")
  async getActiveBattles(@Query() query: DiscoveryBattlesQueryDto): Promise<BattlePairListDto> {
    return this.discoveryService.getActiveBattles(assertDiscoveryLimit(query.limit, 12), query.locale);
  }

  @Get("growth/battles/suggested")
  async getSuggestedBattles(@Query() query: DiscoveryBattlesQueryDto): Promise<BattlePairListDto> {
    return this.discoveryService.getSuggestedBattles(assertDiscoveryLimit(query.limit, 12), query.locale);
  }

  @Get("discovery/ratings/top")
  async getTopRatings(@Query() query: DiscoveryRatingsTopQueryDto): Promise<DiscoveryEntityRankListDto> {
    return this.discoveryService.getTopRatings(
      normalizeTopRatingsSort(query.sort ?? query.window),
      assertDiscoveryLimit(query.limit, 20)
    );
  }

  @Get("discovery/ratings/rising")
  async getRisingRatings(@Query() query: DiscoveryRatingsRisingQueryDto): Promise<DiscoveryEntityRankListDto> {
    return this.discoveryService.getRisingRatings(query.window ?? "day", assertDiscoveryLimit(query.limit, 20));
  }

  @Get("discovery/discussions/feed")
  async getDiscussionFeed(@Query() query: DiscoveryLimitQueryDto): Promise<DiscussionFeedDto> {
    return this.discoveryService.getDiscussionFeed(
      assertDiscoveryLimit(query.limit, 6),
      query.locale
    );
  }

  @Get("discovery/battles/random")
  async getRandomBattle(@Query() query: DiscoveryBattlesQueryDto): Promise<RandomBattleDto> {
    return this.discoveryService.getRandomBattle(query.locale);
  }

  @Get("discovery/stats")
  async getStats(): Promise<DiscoveryStatsDto> {
    return this.discoveryService.getStats();
  }

  @Post("discovery/presence/heartbeat")
  async registerSitePresence(@Body() body: SitePresenceHeartbeatDto): Promise<DiscoveryStatsDto> {
    return this.discoveryService.registerSiteVisitor(body.visitorId);
  }
}
