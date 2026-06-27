import { readPersistedEntityRating } from "../../shared/entity-rating-sync.js";
import { fetchMyEntityRating } from "./fetch-my-entity-rating.js";

export async function resolveMyEntityRatingScore(entityId: string): Promise<number | null> {
  const [persistedScore, apiScore] = await Promise.all([
    readPersistedEntityRating(entityId),
    fetchMyEntityRating(entityId)
  ]);

  if (apiScore !== null) {
    return apiScore;
  }

  return persistedScore;
}
