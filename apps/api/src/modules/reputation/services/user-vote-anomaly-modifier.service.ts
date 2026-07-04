import { Injectable } from "@nestjs/common";

import { clamp, roundToThreeDecimals } from "../utils/reputation-math.js";

export interface UserVoteAnomalyModifierInput {
  accountAgeDays: number;
  entityBurstRatingsLastHour: number;
  entityNewAccountClusterScore: number;
  isInSyncWindow: boolean;
  userCoordinationScore?: number;
}

export interface UserVoteAnomalyModifierResult {
  appliedSignals: UserVoteAnomalySignal[];
  modifier: number;
}

export type UserVoteAnomalySignal =
  | "COORDINATION_CLUSTER"
  | "ENTITY_BURST"
  | "NEW_ACCOUNT_CLUSTER"
  | "SYNC_WINDOW";

const NEW_ACCOUNT_MAX_AGE_DAYS = 7;
const NEW_ACCOUNT_CLUSTER_THRESHOLD = 0.5;
const ENTITY_BURST_THRESHOLD = 10;
const COORDINATION_SCORE_THRESHOLD = 0.5;

@Injectable()
export class UserVoteAnomalyModifierService {
  calculate(input: UserVoteAnomalyModifierInput): UserVoteAnomalyModifierResult {
    const appliedSignals: UserVoteAnomalySignal[] = [];
    let modifier = 1;

    if (
      input.accountAgeDays <= NEW_ACCOUNT_MAX_AGE_DAYS &&
      input.entityNewAccountClusterScore > NEW_ACCOUNT_CLUSTER_THRESHOLD
    ) {
      modifier = Math.min(modifier, 0.35);
      appliedSignals.push("NEW_ACCOUNT_CLUSTER");
    }

    if (input.isInSyncWindow) {
      modifier = Math.min(modifier, 0.3);
      appliedSignals.push("SYNC_WINDOW");
    }

    if (input.entityBurstRatingsLastHour > ENTITY_BURST_THRESHOLD) {
      modifier = Math.min(modifier, 0.5);
      appliedSignals.push("ENTITY_BURST");
    }

    if (
      input.userCoordinationScore !== undefined &&
      input.userCoordinationScore > COORDINATION_SCORE_THRESHOLD
    ) {
      modifier = Math.min(modifier, 0.2);
      appliedSignals.push("COORDINATION_CLUSTER");
    }

    return {
      appliedSignals,
      modifier: roundToThreeDecimals(clamp(modifier, 0.05, 1))
    };
  }
}
