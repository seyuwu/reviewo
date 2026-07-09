import { Injectable } from "@nestjs/common";
import type { ContributionPolicy, ContributionTier } from "#prisma/client";
import { ContributionType } from "#prisma/client";

import {
  UPDATE_URL_CHANGE_ACTIVITY_BONUS,
  UPDATE_URL_CHANGE_ACTIVITY_BONUS_VOTES_THRESHOLD,
  UPDATE_URL_CHANGE_ACTIVITY_SCALE,
  UPDATE_URL_CHANGE_BASE_APPROVE_WEIGHT,
  UPDATE_URL_CHANGE_MIN_UNIQUE_VOTERS
} from "../constants/contribution-limits.js";
import type { FieldChangePayload } from "../types/contribution-payload.js";
import { isFieldChangePayload } from "../types/contribution-payload.js";

export interface ContributionVoteTotals {
  approvalsWeight: number;
  rejectionsWeight: number;
  uniqueApprovers: number;
  uniqueRejecters: number;
}

export interface ContributionEvaluationInput {
  payload: unknown;
  policy: ContributionPolicy;
  tier: ContributionTier;
  totals: ContributionVoteTotals;
  type: ContributionType;
  votesCount: number;
}

export type ContributionEvaluationOutcome =
  | { action: "none" }
  | { action: "apply" }
  | { action: "reject" };

export interface ContributionRequirements {
  minUniqueVoters: number;
  requiredApprovalsWeight: number;
  requiredRejectionsWeight: number;
}

@Injectable()
export class ContributionEvaluatorService {
  evaluate(input: ContributionEvaluationInput): ContributionEvaluationOutcome {
    const requiredApproveWeight = this.resolveRequiredApproveWeight(input);
    const rejectThreshold = Number(input.policy.baseRejectWeight);

    if (input.totals.rejectionsWeight >= rejectThreshold) {
      return { action: "reject" };
    }

    if (input.tier === "MODERATION") {
      return { action: "none" };
    }

    const minUniqueVoters = this.resolveMinUniqueVoters(input);

    if (
      input.totals.approvalsWeight >= requiredApproveWeight &&
      input.totals.uniqueApprovers >= minUniqueVoters
    ) {
      return { action: "apply" };
    }

    return { action: "none" };
  }

  resolveRequirements(input: ContributionEvaluationInput): ContributionRequirements {
    return {
      minUniqueVoters: this.resolveMinUniqueVoters(input),
      requiredApprovalsWeight: this.resolveRequiredApproveWeight(input),
      requiredRejectionsWeight: Number(input.policy.baseRejectWeight)
    };
  }

  private resolveRequiredApproveWeight(input: ContributionEvaluationInput): number {
    let base = Number(input.policy.baseApproveWeight);

    if (input.type === ContributionType.UPDATE_URL && this.isUrlChange(input.payload)) {
      base = UPDATE_URL_CHANGE_BASE_APPROVE_WEIGHT;
    }

    if (!this.shouldScaleActivity(input)) {
      return base;
    }

    const activityBonus = 0.5 * Math.floor(Math.log10(Math.max(input.votesCount, 1)));

    if (
      input.type === ContributionType.UPDATE_URL &&
      this.isUrlChange(input.payload) &&
      input.votesCount > UPDATE_URL_CHANGE_ACTIVITY_BONUS_VOTES_THRESHOLD
    ) {
      return base + activityBonus + UPDATE_URL_CHANGE_ACTIVITY_BONUS;
    }

    return base + activityBonus;
  }

  private resolveMinUniqueVoters(input: ContributionEvaluationInput): number {
    if (input.type === ContributionType.UPDATE_URL && this.isUrlChange(input.payload)) {
      return UPDATE_URL_CHANGE_MIN_UNIQUE_VOTERS;
    }

    return input.policy.minUniqueVoters;
  }

  private shouldScaleActivity(input: ContributionEvaluationInput): boolean {
    if (input.type === ContributionType.UPDATE_URL && this.isUrlChange(input.payload)) {
      return UPDATE_URL_CHANGE_ACTIVITY_SCALE;
    }

    return input.policy.activityScale;
  }

  private isUrlChange(payload: unknown): boolean {
    if (!isFieldChangePayload(payload)) {
      return false;
    }

    return payload.oldValue !== null && payload.oldValue.trim().length > 0;
  }
}
