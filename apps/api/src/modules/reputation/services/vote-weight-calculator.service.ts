import { Injectable } from "@nestjs/common";

import { clamp, roundToThreeDecimals } from "../utils/reputation-math.js";

export interface VoteWeightContext {
  anomalyModifier: number;
  entityId: string;
  userId: string;
  userTrust: number;
}

export interface VoteWeightFactorDefinition {
  enabled: boolean;
  name: keyof VoteWeightFactorValues;
}

export interface VoteWeightFactorValues {
  anomalyModifier: number;
  expertise: number;
  userTrust: number;
}

export interface VoteWeightResult {
  factors: Partial<VoteWeightFactorValues>;
  weight: number;
}

@Injectable()
export class VoteWeightCalculator {
  private readonly factorDefinitions: VoteWeightFactorDefinition[] = [
    { enabled: true, name: "userTrust" },
    { enabled: false, name: "expertise" },
    { enabled: true, name: "anomalyModifier" }
  ];

  calculate(context: VoteWeightContext): VoteWeightResult {
    const resolved: VoteWeightFactorValues = {
      anomalyModifier: context.anomalyModifier,
      expertise: 1,
      userTrust: context.userTrust
    };

    let product = 1;
    const applied: Partial<VoteWeightFactorValues> = {};

    for (const factor of this.factorDefinitions) {
      if (!factor.enabled) {
        continue;
      }

      const value = resolved[factor.name];
      applied[factor.name] = value;
      product *= value;
    }

    return {
      factors: applied,
      weight: roundToThreeDecimals(clamp(product, 0.05, 1))
    };
  }
}
