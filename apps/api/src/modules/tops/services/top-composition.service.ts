import { Injectable } from "@nestjs/common";

import { MIN_TOP_ITEMS } from "../constants/top-limits.js";
import { TopsRepository } from "../repositories/tops.repository.js";

@Injectable()
export class TopCompositionService {
  constructor(private readonly topsRepository: TopsRepository) {}

  async syncVisibilityForEntityIds(entityIds: string[]): Promise<void> {
    const uniqueEntityIds = [...new Set(entityIds.filter(Boolean))];

    if (uniqueEntityIds.length === 0) {
      return;
    }

    const topIds = await this.topsRepository.findActiveTopIdsForEntities(uniqueEntityIds);

    for (const topId of topIds) {
      const activeItemCount = await this.topsRepository.countActiveItems(topId);

      if (activeItemCount < MIN_TOP_ITEMS) {
        await this.topsRepository.updateVisibility(topId, "HIDDEN");
      }
    }
  }
}
