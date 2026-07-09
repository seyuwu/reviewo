import { Injectable } from "@nestjs/common";

import { clamp, roundToThreeDecimals } from "../../reputation/utils/reputation-math.js";

@Injectable()
export class ContributionVoteWeightService {
  resolveWeight(userId: string): number {
    void userId;
    return roundToThreeDecimals(clamp(1, 0.05, 1));
  }
}
