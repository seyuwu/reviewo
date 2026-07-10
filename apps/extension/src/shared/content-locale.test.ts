import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendPathContentLocale,
  resolveExtensionContentLocale,
  resolveReviewsContentLocale
} from "./content-locale.js";

describe("extension content-locale", () => {
  it("resolveExtensionContentLocale maps preference to ru or en", () => {
    assert.equal(resolveExtensionContentLocale("en"), "en");
    assert.equal(resolveExtensionContentLocale("ru"), "ru");
  });

  it("resolveReviewsContentLocale returns all when show-all is enabled", () => {
    assert.equal(resolveReviewsContentLocale("en", false), "en");
    assert.equal(resolveReviewsContentLocale("en", true), "all");
  });

  it("appendPathContentLocale appends locale query param", () => {
    assert.equal(
      appendPathContentLocale("/reviews/entities/abc", "ru"),
      "/reviews/entities/abc?locale=ru"
    );
  });
});
