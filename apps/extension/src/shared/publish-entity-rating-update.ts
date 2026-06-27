import { persistEntityRating } from "./entity-rating-sync.js";
import { createEntityRatingUpdatedMessage } from "./messages.js";
import type { ExtensionQuickRatingResponse } from "./types/quick-rating.js";

export async function publishEntityRatingUpdate(options: {
  canonicalUrl: string;
  entityId: string;
  quickRating?: ExtensionQuickRatingResponse;
  score: number;
}): Promise<void> {
  await persistEntityRating({
    canonicalUrl: options.canonicalUrl,
    entityId: options.entityId,
    score: options.score,
    updatedAt: new Date().toISOString(),
    ...(options.quickRating
      ? {
          avgScore: options.quickRating.rating.avgScore,
          votesCount: options.quickRating.rating.votesCount
        }
      : {})
  });

  await chrome.runtime.sendMessage(
    createEntityRatingUpdatedMessage({
      canonicalUrl: options.canonicalUrl,
      entityId: options.entityId,
      quickRating: options.quickRating,
      score: options.score
    })
  );
}
