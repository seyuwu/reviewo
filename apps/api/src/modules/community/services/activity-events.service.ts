import { Injectable } from "@nestjs/common";

import { ActivityActionType } from "../constants/activity-action-type.js";
import type { AppendActivityEventInput } from "../repositories/activity-events.repository.js";
import { ActivityEventsRepository } from "../repositories/activity-events.repository.js";
import { ContributionSnapshotService } from "./contribution-snapshot.service.js";

@Injectable()
export class ActivityEventsService {
  constructor(
    private readonly activityEventsRepository: ActivityEventsRepository,
    private readonly contributionSnapshotService: ContributionSnapshotService
  ) {}

  async recordActivity(input: AppendActivityEventInput): Promise<void> {
    const created = await this.activityEventsRepository.append(input);

    if (created) {
      await this.contributionSnapshotService.recomputeForUser(input.userId);
    }
  }
}

export { ActivityActionType };
