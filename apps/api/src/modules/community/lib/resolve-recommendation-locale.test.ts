import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchesRecommendationLocale,
  resolveRecommendationLocale
} from "./resolve-recommendation-locale.js";

describe("resolveRecommendationLocale", () => {
  it("prefers explicit locale input", () => {
    assert.equal(resolveRecommendationLocale({ localeInput: "en" }), "en");
    assert.equal(resolveRecommendationLocale({ localeInput: "ru" }), "ru");
  });

  it("uses review locale when explicit locale is missing", () => {
    assert.equal(resolveRecommendationLocale({ reviewLocale: "en" }), "en");
  });

  it("infers locale from message text", () => {
    assert.equal(resolveRecommendationLocale({ message: "Отличный сервис" }), "ru");
    assert.equal(resolveRecommendationLocale({ message: "Great product" }), "en");
  });

  it("uses top locale as fallback", () => {
    assert.equal(resolveRecommendationLocale({ topLocale: "en" }), "en");
  });
});

describe("matchesRecommendationLocale", () => {
  it("matches ru and en filters", () => {
    assert.equal(matchesRecommendationLocale("ru", "ru"), true);
    assert.equal(matchesRecommendationLocale("en", "ru"), false);
    assert.equal(matchesRecommendationLocale("en", "all"), true);
  });
});
