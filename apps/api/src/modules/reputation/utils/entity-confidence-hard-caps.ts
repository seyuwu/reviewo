import { clamp } from "./reputation-math.js";

export const UNIQUE_RATIO_TARGET = 0.6;
export const UNIQUE_RATIO_HARD_CAP_THRESHOLD = 0.25;
export const ANOMALY_HARD_CAP_THRESHOLD = 0.7;
export const NEW_ACCOUNT_SHARE_HARD_CAP_THRESHOLD = 0.6;
export const NEW_ACCOUNT_HARD_CAP_MIN_VOTES = 10;
export const NEW_ACCOUNT_HARD_CAP_MIN_UNIQUE_RATERS = 5;

export const HARD_CAP_ANOMALY = 0.4;
export const HARD_CAP_UNIQUE_RATIO = 0.5;
export const HARD_CAP_NEW_ACCOUNT_SHARE = 0.45;
export const HARD_CAP_COORDINATION_EXPOSURE = 0.35;

export const COORDINATION_HARD_CAP_MIN_PLATFORM_USERS = 500;
export const COORDINATION_EXPOSURE_HARD_CAP_THRESHOLD = 0.4;

export interface EntityConfidenceHardCapInput {
  anomalyScore: number;
  coordinationExposureShare?: number;
  newAccountShare?: number;
  platformUserCount?: number;
  uniqueRatersCount: number;
  votesCount: number;
}

export interface EntityConfidenceHardCapResult {
  appliedCaps: EntityConfidenceHardCapCode[];
  hardCap: number;
  uniqueRatio: number;
  uniqueRatioFactor: number;
}

export type EntityConfidenceHardCapCode =
  | "ANOMALY"
  | "COORDINATION_EXPOSURE"
  | "NEW_ACCOUNT_SHARE"
  | "UNIQUE_RATIO";

export function calculateUniqueRatio(uniqueRatersCount: number, votesCount: number): number {
  return uniqueRatersCount / Math.max(votesCount, 1);
}

export function calculateUniqueRatioFactor(uniqueRatersCount: number, votesCount: number): number {
  return clamp(calculateUniqueRatio(uniqueRatersCount, votesCount) / UNIQUE_RATIO_TARGET, 0, 1);
}

export function calculateEntityConfidenceHardCap(
  input: EntityConfidenceHardCapInput
): EntityConfidenceHardCapResult {
  const uniqueRatio = calculateUniqueRatio(input.uniqueRatersCount, input.votesCount);
  const uniqueRatioFactor = calculateUniqueRatioFactor(
    input.uniqueRatersCount,
    input.votesCount
  );
  const appliedCaps: EntityConfidenceHardCapCode[] = [];
  let hardCap = 1;

  if (input.anomalyScore >= ANOMALY_HARD_CAP_THRESHOLD) {
    hardCap = Math.min(hardCap, HARD_CAP_ANOMALY);
    appliedCaps.push("ANOMALY");
  }

  if (uniqueRatio < UNIQUE_RATIO_HARD_CAP_THRESHOLD) {
    hardCap = Math.min(hardCap, HARD_CAP_UNIQUE_RATIO);
    appliedCaps.push("UNIQUE_RATIO");
  }

  if (
    shouldApplyNewAccountShareCap({
      ...(input.newAccountShare !== undefined ? { newAccountShare: input.newAccountShare } : {}),
      uniqueRatersCount: input.uniqueRatersCount,
      votesCount: input.votesCount
    })
  ) {
    hardCap = Math.min(hardCap, HARD_CAP_NEW_ACCOUNT_SHARE);
    appliedCaps.push("NEW_ACCOUNT_SHARE");
  }

  if (
    shouldApplyCoordinationExposureCap({
      ...(input.coordinationExposureShare !== undefined
        ? { coordinationExposureShare: input.coordinationExposureShare }
        : {}),
      ...(input.platformUserCount !== undefined ? { platformUserCount: input.platformUserCount } : {})
    })
  ) {
    hardCap = Math.min(hardCap, HARD_CAP_COORDINATION_EXPOSURE);
    appliedCaps.push("COORDINATION_EXPOSURE");
  }

  return {
    appliedCaps,
    hardCap,
    uniqueRatio,
    uniqueRatioFactor
  };
}

function shouldApplyNewAccountShareCap(input: {
  newAccountShare?: number;
  uniqueRatersCount: number;
  votesCount: number;
}): boolean {
  if (input.newAccountShare === undefined) {
    return false;
  }

  if (input.votesCount < NEW_ACCOUNT_HARD_CAP_MIN_VOTES) {
    return false;
  }

  if (input.uniqueRatersCount < NEW_ACCOUNT_HARD_CAP_MIN_UNIQUE_RATERS) {
    return false;
  }

  return input.newAccountShare >= NEW_ACCOUNT_SHARE_HARD_CAP_THRESHOLD;
}

function shouldApplyCoordinationExposureCap(input: {
  coordinationExposureShare?: number;
  platformUserCount?: number;
}): boolean {
  if (input.coordinationExposureShare === undefined || input.platformUserCount === undefined) {
    return false;
  }

  if (input.platformUserCount < COORDINATION_HARD_CAP_MIN_PLATFORM_USERS) {
    return false;
  }

  return input.coordinationExposureShare >= COORDINATION_EXPOSURE_HARD_CAP_THRESHOLD;
}
