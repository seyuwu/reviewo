import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isValidTopCategorySlug,
  normalizeTopCategoryTitle,
  slugifyTopCategoryTitle
} from "./top-category-slug.utils.js";

describe("top category slug utils", () => {
  it("slugifies latin titles", () => {
    assert.equal(slugifyTopCategoryTitle("Best AI Tools"), "best-ai-tools");
  });

  it("normalizes whitespace in titles", () => {
    assert.equal(normalizeTopCategoryTitle("  Roblox   games  "), "Roblox games");
  });

  it("validates category slugs", () => {
    assert.equal(isValidTopCategorySlug("ai-tools"), true);
    assert.equal(isValidTopCategorySlug("bad slug"), false);
  });
});
