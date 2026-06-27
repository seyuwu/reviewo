import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveTitleFromCanonicalUrl, sanitizeLazyEntityTitle } from "./lazy-entity-title.js";

describe("sanitizeLazyEntityTitle", () => {
  it("trims, collapses whitespace, and limits title length", () => {
    const title = sanitizeLazyEntityTitle("  OpenAI   Official   Website  ", "https://openai.com/");

    assert.equal(title, "OpenAI Official Website");
  });

  it("falls back to hostname when source title is empty", () => {
    const title = sanitizeLazyEntityTitle("   ", "https://github.com/");

    assert.equal(title, "github.com");
  });
});

describe("deriveTitleFromCanonicalUrl", () => {
  it("uses normalized hostname", () => {
    assert.equal(deriveTitleFromCanonicalUrl("https://example.com/path"), "example.com");
  });
});
