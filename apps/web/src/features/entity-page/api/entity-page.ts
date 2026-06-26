import { apiRequest } from "../../../lib/api/api-client";
import type {
  EntityPageResponse,
  RateEntityResponse,
  Review,
  UserRating
} from "../types/entity-page";

export function getEntityPage(entityId: string): Promise<EntityPageResponse> {
  return apiRequest<EntityPageResponse>(`/entities/${entityId}/page`);
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

export function getMyReview(entityId: string, accessToken: string): Promise<Review | null> {
  return apiRequest<Review | null>(`/reviews/entities/${entityId}/my-review`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function upsertMyReview(
  entityId: string,
  text: string,
  accessToken: string
): Promise<Review> {
  return apiRequest<Review>(`/reviews/entities/${entityId}/my-review`, {
    body: {
      text
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "PUT"
  });
}
