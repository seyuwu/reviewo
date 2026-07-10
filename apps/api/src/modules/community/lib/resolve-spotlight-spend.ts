import { HttpStatus } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import {
  SPOTLIGHT_HOURS_PER_CREDIT,
  SPOTLIGHT_MAX_SPEND_PER_REQUEST,
  SPOTLIGHT_SPEND_COSTS,
  type SpotlightSpendType
} from "../constants/spotlight-credits.js";

export interface ResolvedSpotlightSpend {
  cost: number;
  durationMs: number;
}

export function resolveSpotlightSpend(
  placementType: SpotlightSpendType,
  credits?: number
): ResolvedSpotlightSpend {
  const minCost = SPOTLIGHT_SPEND_COSTS[placementType];
  const cost = credits ?? minCost;

  if (!Number.isInteger(cost) || cost < minCost || cost > SPOTLIGHT_MAX_SPEND_PER_REQUEST) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: `Spend between ${minCost} and ${SPOTLIGHT_MAX_SPEND_PER_REQUEST} spotlight credits`,
      statusCode: HttpStatus.BAD_REQUEST
    });
  }

  return {
    cost,
    durationMs: cost * SPOTLIGHT_HOURS_PER_CREDIT * 3_600_000
  };
}

export function resolveSpotlightDurationHours(credits: number): number {
  return credits * SPOTLIGHT_HOURS_PER_CREDIT;
}
