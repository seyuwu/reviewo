import { HttpStatus } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import {
  SPOTLIGHT_MESSAGE_MIN_LENGTH,
  type AuthorReviewRow,
  pickAuthorReview,
  type SpotlightContentLocale
} from "./spotlight-recommendation.mapper.js";

export interface ResolvedEntityRecommendationPitch {
  message: string | null;
  review: { id: string; text: string } | null;
}

export function resolveEntityRecommendationPitch(input: {
  locale: SpotlightContentLocale;
  message?: string | null | undefined;
  reviews: AuthorReviewRow[];
  userId: string;
  entityId: string;
}): ResolvedEntityRecommendationPitch {
  const trimmedMessage = input.message?.trim() ?? "";

  if (trimmedMessage) {
    if (trimmedMessage.length < SPOTLIGHT_MESSAGE_MIN_LENGTH) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: `Recommendation message must be at least ${SPOTLIGHT_MESSAGE_MIN_LENGTH} characters`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    return {
      message: trimmedMessage,
      review: null
    };
  }

  const pickedReview = pickAuthorReview(input.reviews, input.userId, input.entityId, input.locale);

  if (!pickedReview) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: "Add a review or a short recommendation message",
      statusCode: HttpStatus.BAD_REQUEST
    });
  }

  return {
    message: null,
    review: pickedReview
  };
}
