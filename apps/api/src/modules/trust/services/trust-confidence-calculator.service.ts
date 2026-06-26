import { Injectable } from "@nestjs/common";

const MAX_RATING_COUNT_FOR_CONFIDENCE = 100;
const MAX_REVIEW_COUNT_FOR_CONFIDENCE = 20;
const RATING_WEIGHT = 0.9;
const REVIEW_WEIGHT = 0.1;

export interface TrustConfidenceInput {
  reviewCount: number;
  votesCount: number;
}

@Injectable()
export class TrustConfidenceCalculatorService {
  calculate(input: TrustConfidenceInput): number {
    const ratingContribution =
      (Math.min(input.votesCount, MAX_RATING_COUNT_FOR_CONFIDENCE) /
        MAX_RATING_COUNT_FOR_CONFIDENCE) *
      RATING_WEIGHT;
    const reviewContribution =
      (Math.min(input.reviewCount, MAX_REVIEW_COUNT_FOR_CONFIDENCE) /
        MAX_REVIEW_COUNT_FOR_CONFIDENCE) *
      REVIEW_WEIGHT;

    return roundToTwoDecimals(Math.min(1, ratingContribution + reviewContribution));
  }
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
