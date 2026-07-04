import { Injectable, Logger } from "@nestjs/common";

import { COORDINATION_HARD_CAP_MIN_PLATFORM_USERS } from "../utils/entity-confidence-hard-caps.js";
import { ReputationReadRepository } from "../repositories/reputation-read.repository.js";
import { ReputationRepository } from "../repositories/reputation.repository.js";
import { CoordinationGraphService } from "./coordination-graph.service.js";

export interface CoordinationGraphJobResult {
  clustersDetected: number;
  platformUserCount: number;
  usersFlagged: number;
}

@Injectable()
export class CoordinationGraphJobService {
  private readonly logger = new Logger(CoordinationGraphJobService.name);

  constructor(
    private readonly coordinationGraphService: CoordinationGraphService,
    private readonly readRepository: ReputationReadRepository,
    private readonly reputationRepository: ReputationRepository
  ) {}

  async recalculate(): Promise<CoordinationGraphJobResult> {
    const platformUserCount = await this.readRepository.countPlatformUsers();

    if (platformUserCount < COORDINATION_HARD_CAP_MIN_PLATFORM_USERS) {
      this.logger.debug(
        `Skipping coordination cluster persistence: platformUserCount=${platformUserCount}`
      );

      return {
        clustersDetected: 0,
        platformUserCount,
        usersFlagged: 0
      };
    }

    const userEntitySets = await this.readRepository.listUserEntitySetsForCoordinationGraph();
    const clusters = this.coordinationGraphService.detectClusters(userEntitySets);

    await this.reputationRepository.replaceCoordinationClusters({
      clusters
    });

    return {
      clustersDetected: clusters.length,
      platformUserCount,
      usersFlagged: clusters.reduce((sum, cluster) => sum + cluster.memberUserIds.length, 0)
    };
  }
}
