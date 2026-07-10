import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchesRecommendationLocale,
  resolveRecommendationLocale
} from "../lib/resolve-recommendation-locale.js";
import { parseSpotlightContentLocale } from "../lib/spotlight-recommendation.mapper.js";

describe("SpotlightService feed locale", () => {
  it("defaults spotlight feed locale to ru", () => {
    assert.equal(parseSpotlightContentLocale(undefined), "ru");
    assert.equal(parseSpotlightContentLocale("ru"), "ru");
    assert.equal(parseSpotlightContentLocale("en"), "en");
    assert.equal(parseSpotlightContentLocale("all"), "all");
    assert.equal(parseSpotlightContentLocale("invalid"), "ru");
  });

  it("filters recommendation locales for feed", () => {
    assert.equal(matchesRecommendationLocale("en", "en"), true);
    assert.equal(matchesRecommendationLocale("ru", "en"), false);
    assert.equal(matchesRecommendationLocale("ru", "all"), true);
  });

  it("stores recommendation locale from spend input", () => {
    assert.equal(
      resolveRecommendationLocale({ localeInput: "en", message: "Привет" }),
      "en"
    );
    assert.equal(resolveRecommendationLocale({ topLocale: "en" }), "en");
  });
});
