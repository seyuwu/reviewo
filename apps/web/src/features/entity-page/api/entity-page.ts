import { appendContentLocaleToPath } from "../../i18n/content-locale";
import { apiRequest } from "../../../lib/api/api-client";
import type {
  EntityPageResponse,
  RateEntityResponse,
  Review,
  UserRating
} from "../types/entity-page";
import type { ContentLocaleParam } from "../../i18n/content-locale";

export function getEntityPage(
  entityId: string,
  accessToken?: string,
  locale?: ContentLocaleParam
): Promise<EntityPageResponse> {
  const path = locale
    ? appendContentLocaleToPath(`/entities/${entityId}/page`, locale)
    : `/entities/${entityId}/page`;

  if (!accessToken) {
    return apiRequest<EntityPageResponse>(path);
  }

  return apiRequest<EntityPageResponse>(path, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function getMyRating(entityId: string, accessToken: string): Promise<UserRating | null> {
  return apiRequest<UserRating | null>(`/ratings/entities/${entityId}/my-rating`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function rateEntity(
  entityId: string,
  score: number,
  accessToken: string
): Promise<RateEntityResponse> {
  return apiRequest<RateEntityResponse>(`/ratings/entities/${entityId}/my-rating`, {
    body: {
      score
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "PUT"
  });
}

export function getMyReview(
  entityId: string,
  accessToken: string,
  locale: ContentLocaleParam
): Promise<Review | null> {
  return apiRequest<Review | null>(
    appendContentLocaleToPath(`/reviews/entities/${entityId}/my-review`, locale),
    {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    }
  );
}

export function upsertMyReview(
  entityId: string,
  text: string,
  accessToken: string,
  locale: ContentLocaleParam
): Promise<Review> {
  return apiRequest<Review>(
    appendContentLocaleToPath(`/reviews/entities/${entityId}/my-review`, locale),
    {
      body: {
        locale: locale === "all" ? undefined : locale,
        text
      },
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      method: "PUT"
    }
  );
}

export function likeReview(reviewId: string, accessToken: string): Promise<Review> {
  return apiRequest<Review>(`/reviews/${reviewId}/like`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function unlikeReview(reviewId: string, accessToken: string): Promise<Review> {
  return apiRequest<Review>(`/reviews/${reviewId}/like`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "DELETE"
  });
}
