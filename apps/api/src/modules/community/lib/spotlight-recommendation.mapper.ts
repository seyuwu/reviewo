import type {
  SpotlightPlacementDto,
  SpotlightRecommendationDto
} from "../dto/spotlight.dto.js";

export type SpotlightContentLocale = "ru" | "en" | "all";

export const REVIEW_EXCERPT_MAX_LENGTH = 160;

export const SPOTLIGHT_MESSAGE_MAX_LENGTH = 280;

export const SPOTLIGHT_MESSAGE_MIN_LENGTH = 10;

export interface AuthorReviewRow {
  authorId: string;
  entityId: string;
  id: string;
  locale: string;
  text: string;
}

export interface EntityRatingRow {
  avgScore: number;
  entityId: string;
  votesCount: number;
}

export function resolveReviewLocales(locale: SpotlightContentLocale): string[] {
  if (locale === "ru") {
    return ["ru"];
  }

  if (locale === "en") {
    return ["en"];
  }

  return ["ru", "en"];
}

export function pickAuthorReview(
  reviews: AuthorReviewRow[],
  authorId: string,
  entityId: string,
  locale: SpotlightContentLocale
): { id: string; text: string } | null {
  const matching = reviews.filter(
    (review) => review.authorId === authorId && review.entityId === entityId
  );

  for (const reviewLocale of resolveReviewLocales(locale)) {
    const found = matching.find((review) => review.locale === reviewLocale);

    if (found) {
      return { id: found.id, text: found.text };
    }
  }

  return null;
}

export function truncateReviewExcerpt(
  text: string,
  maxLength = REVIEW_EXCERPT_MAX_LENGTH
): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildRecommendationDto(input: {
  authorDisplayName: string;
  cost: number;
  endsAt: string;
  endorsementsCount?: number;
  entityRating?: EntityRatingRow | null | undefined;
  message?: string | null | undefined;
  review?: { id: string; text: string } | null | undefined;
  viewerCanEndorse?: boolean;
  viewerHasEndorsed?: boolean;
}): SpotlightRecommendationDto {
  const recommendation: SpotlightRecommendationDto = {
    authorDisplayName: input.authorDisplayName,
    creditsSpent: input.cost,
    endsAt: input.endsAt,
    supportedByCredits: true
  };

  if (input.review) {
    recommendation.reviewId = input.review.id;
    recommendation.reviewExcerpt = truncateReviewExcerpt(input.review.text);
  } else if (input.message) {
    recommendation.recommendationMessage = truncateReviewExcerpt(
      input.message,
      SPOTLIGHT_MESSAGE_MAX_LENGTH
    );
  }

  if (input.entityRating && input.entityRating.votesCount > 0) {
    recommendation.entityRating = {
      avgScore: input.entityRating.avgScore,
      votesCount: input.entityRating.votesCount
    };
  }

  if (input.endorsementsCount !== undefined) {
    recommendation.endorsementsCount = input.endorsementsCount;
  }

  if (input.viewerHasEndorsed !== undefined) {
    recommendation.viewerHasEndorsed = input.viewerHasEndorsed;
  }

  if (input.viewerCanEndorse !== undefined) {
    recommendation.viewerCanEndorse = input.viewerCanEndorse;
  }

  return recommendation;
}

export function attachRecommendationToPlacement(
  placement: SpotlightPlacementDto,
  input: {
    cost: number;
    endorsementsCount?: number;
    entityRating?: EntityRatingRow | null | undefined;
    locale: SpotlightContentLocale;
    message?: string | null;
    review?: { id: string; text: string } | null | undefined;
    viewerCanEndorse?: boolean;
    viewerHasEndorsed?: boolean;
  }
): SpotlightPlacementDto {
  return {
    ...placement,
    recommendation: buildRecommendationDto({
      authorDisplayName: placement.sponsorDisplayName,
      cost: input.cost,
      endsAt: placement.endsAt,
      ...(input.endorsementsCount !== undefined ? { endorsementsCount: input.endorsementsCount } : {}),
      ...(input.entityRating !== undefined ? { entityRating: input.entityRating } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.review ? { review: input.review } : {}),
      ...(input.viewerCanEndorse !== undefined ? { viewerCanEndorse: input.viewerCanEndorse } : {}),
      ...(input.viewerHasEndorsed !== undefined ? { viewerHasEndorsed: input.viewerHasEndorsed } : {})
    })
  };
}

export function parseSpotlightContentLocale(value?: string): SpotlightContentLocale {
  if (value === "en" || value === "all") {
    return value;
  }

  return "ru";
}
