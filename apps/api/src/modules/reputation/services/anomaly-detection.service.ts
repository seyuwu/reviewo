import { Injectable } from "@nestjs/common";

import { clamp, roundToThreeDecimals } from "../utils/reputation-math.js";

export interface AnomalyDetectionInput {
  clusterScore?: number;
  coordinationClusterScore?: number;
  newAccountClusterScore?: number;
  ratingsLastHour: number;
  syncClusterCount: number;
}

export interface AnomalyDetectionResult {
  anomalyScore: number;
  burstScore: number;
  clusterScore: number;
  recentBurstCount: number;
  syncScore: number;
}

@Injectable()
export class AnomalyDetectionService {
  detect(input: AnomalyDetectionInput): AnomalyDetectionResult {
    const burstScore = roundToThreeDecimals(clamp(input.ratingsLastHour / 20, 0, 1));
    const syncScore = roundToThreeDecimals(clamp(input.syncClusterCount / 3, 0, 1));
    const clusterScore = roundToThreeDecimals(
      Math.max(
        clamp(input.clusterScore ?? 0, 0, 1),
        clamp(input.newAccountClusterScore ?? 0, 0, 1),
        clamp(input.coordinationClusterScore ?? 0, 0, 1)
      )
    );
    const anomalyScore = roundToThreeDecimals(
      Math.max(burstScore, syncScore * 0.8, clusterScore * 0.6)
    );

    return {
      anomalyScore,
      burstScore,
      clusterScore,
      recentBurstCount: input.ratingsLastHour,
      syncScore
    };
  }
}
