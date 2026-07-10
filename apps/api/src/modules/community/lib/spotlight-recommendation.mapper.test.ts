import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attachRecommendationToPlacement,
  buildRecommendationDto,
  pickAuthorReview,
  resolveReviewLocales,
  truncateReviewExcerpt
} from "./spotlight-recommendation.mapper.js";

describe("spotlight recommendation mapper", () => {
  it("resolves review locales with ru-first fallback for all", () => {
    assert.deepEqual(resolveReviewLocales("ru"), ["ru"]);
    assert.deepEqual(resolveReviewLocales("en"), ["en"]);
    assert.deepEqual(resolveReviewLocales("all"), ["ru", "en"]);
  });

  it("picks author review by locale preference", () => {
    const reviews = [
      {
        authorId: "user-1",
        entityId: "entity-1",
        id: "review-en",
        locale: "en",
        text: "English review"
      },
      {
        authorId: "user-1",
        entityId: "entity-1",
        id: "review-ru",
        locale: "ru",
        text: "Русский отзыв"
      }
    ];

    assert.equal(pickAuthorReview(reviews, "user-1", "entity-1", "ru")?.id, "review-ru");
    assert.equal(pickAuthorReview(reviews, "user-1", "entity-1", "en")?.id, "review-en");
    assert.equal(pickAuthorReview(reviews, "user-1", "entity-1", "all")?.id, "review-ru");
  });

  it("truncates long review excerpts", () => {
    const excerpt = truncateReviewExcerpt("a".repeat(200), 160);

    assert.equal(excerpt.length, 160);
    assert.ok(excerpt.endsWith("…"));
  });

  it("builds recommendation with optional review and rating", () => {
    const recommendation = buildRecommendationDto({
      authorDisplayName: "fivii",
      cost: 10,
      endsAt: "2026-07-12T00:00:00.000Z",
      entityRating: { avgScore: 4.8, entityId: "entity-1", votesCount: 23 },
      review: { id: "review-1", text: "Лучший ИИ для TypeScript" }
    });

    assert.equal(recommendation.authorDisplayName, "fivii");
    assert.equal(recommendation.creditsSpent, 10);
    assert.equal(recommendation.reviewId, "review-1");
    assert.equal(recommendation.entityRating?.votesCount, 23);
    assert.equal(recommendation.supportedByCredits, true);
  });

  it("omits empty entity rating from recommendation", () => {
    const recommendation = buildRecommendationDto({
      authorDisplayName: "fivii",
      cost: 10,
      endsAt: "2026-07-12T00:00:00.000Z",
      entityRating: { avgScore: 0, entityId: "entity-1", votesCount: 0 }
    });

    assert.equal(recommendation.entityRating, undefined);
  });

  it("builds recommendation with custom message when no review", () => {
    const recommendation = buildRecommendationDto({
      authorDisplayName: "fivii",
      cost: 10,
      endsAt: "2026-07-12T00:00:00.000Z",
      message: "Отличный инструмент для TypeScript"
    });

    assert.equal(recommendation.recommendationMessage, "Отличный инструмент для TypeScript");
    assert.equal(recommendation.reviewId, undefined);
  });

  it("prefers review over message in recommendation", () => {
    const recommendation = buildRecommendationDto({
      authorDisplayName: "fivii",
      cost: 10,
      endsAt: "2026-07-12T00:00:00.000Z",
      message: "Кастомный текст",
      review: { id: "review-1", text: "Мой отзыв" }
    });

    assert.equal(recommendation.reviewExcerpt, "Мой отзыв");
    assert.equal(recommendation.recommendationMessage, undefined);
  });

  it("attaches recommendation block to placement dto", () => {
    const placement = attachRecommendationToPlacement(
      {
        endsAt: "2026-07-12T00:00:00.000Z",
        href: "/entities/entity-1",
        placementId: "placement-1",
        placementType: "entity_spotlight",
        sponsorDisplayName: "fivii",
        startsAt: "2026-07-10T00:00:00.000Z",
        title: "Claude"
      },
      {
        cost: 10,
        locale: "ru",
        review: { id: "review-1", text: "Отличный инструмент" }
      }
    );

    assert.equal(placement.recommendation?.reviewExcerpt, "Отличный инструмент");
    assert.equal(placement.sponsorDisplayName, "fivii");
  });
});
