import { submitEntityRating } from "../../content/rating-card/submit-entity-rating.js";
import { submitEntityRatingByUrl } from "../../content/rating-card/submit-entity-rating-by-url.js";
import { publishEntityRatingUpdate } from "../../shared/publish-entity-rating-update.js";
import type { EntityViewModel } from "../types.js";

export async function rateEntityViewModel(
  entity: EntityViewModel,
  score: number
): Promise<{ errorMessage?: string; updated?: EntityViewModel }> {
  if (entity.status === "found" && entity.entityId) {
    const result = await submitEntityRating(entity.entityId, score);

    if (!result.result) {
      return {
        errorMessage: result.errorMessage ?? "Could not save rating."
      };
    }

    const updated: EntityViewModel = {
      ...entity,
      avgScore: result.result.rating.avgScore,
      entityPagePath: result.result.web.entityPagePath,
      myRatingScore: result.result.myRating.score,
      status: "found",
      title: result.result.entity.title,
      trustConfidence: result.result.trust.confidence,
      votesCount: result.result.rating.votesCount
    };

    await publishEntityRatingUpdate({
      canonicalUrl: entity.canonicalUrl || result.result.entity.canonicalUrl || entity.pageUrl,
      entityId: result.result.entity.id,
      quickRating: result.result,
      score: result.result.myRating.score
    });

    return { updated };
  }

  const result = await submitEntityRatingByUrl(
    entity.pageUrl,
    score,
    entity.pageTitle ?? entity.title
  );

  if (!result.result) {
    return {
      errorMessage: result.errorMessage ?? "Could not save rating."
    };
  }

  const updated: EntityViewModel = {
    avgScore: result.result.rating.avgScore,
    canonicalUrl: result.result.entity.canonicalUrl ?? entity.canonicalUrl,
    entityId: result.result.entity.id,
    entityPagePath: result.result.web.entityPagePath,
    myRatingScore: result.result.myRating.score,
    pageUrl: entity.pageUrl,
    status: "found",
    title: result.result.entity.title,
    trustConfidence: result.result.trust.confidence,
    votesCount: result.result.rating.votesCount,
    parentEntityId: entity.parentEntityId,
    parentEntityPagePath: entity.parentEntityPagePath,
    parentTitle: entity.parentTitle
  };

  await publishEntityRatingUpdate({
    canonicalUrl: result.result.url.canonical,
    entityId: result.result.entity.id,
    quickRating: result.result,
    score: result.result.myRating.score
  });

  return { updated };
}
