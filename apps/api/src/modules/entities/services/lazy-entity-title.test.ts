import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveTitleFromCanonicalUrl, isGenericLazyEntityTitle, sanitizeLazyEntityTitle } from "./lazy-entity-title.js";

describe("sanitizeLazyEntityTitle", () => {
  it("trims, collapses whitespace, and limits title length", () => {
    const title = sanitizeLazyEntityTitle("  OpenAI   Official   Website  ", "https://openai.com/");

    assert.equal(title, "OpenAI Official Website");
  });

  it("falls back to hostname when source title is empty", () => {
    const title = sanitizeLazyEntityTitle("   ", "https://github.com/");

    assert.equal(title, "github.com");
  });

  it("removes trailing YouTube suffix from source titles", () => {
    const title = sanitizeLazyEntityTitle(
      "My Video Title - YouTube",
      "https://youtube.com/watch?v=abc"
    );

    assert.equal(title, "My Video Title");
  });

  it("treats hostname-only titles as generic", () => {
    assert.equal(isGenericLazyEntityTitle("youtube.com", "https://youtube.com/watch?v=abc"), true);
    assert.equal(
      isGenericLazyEntityTitle("My Video Title", "https://youtube.com/watch?v=abc"),
      false
    );
  });
});

describe("deriveTitleFromCanonicalUrl", () => {
  it("uses normalized hostname", () => {
    assert.equal(deriveTitleFromCanonicalUrl("https://example.com/path"), "example.com");
  });
});
