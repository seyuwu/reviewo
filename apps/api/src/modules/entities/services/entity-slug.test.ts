import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSlugFromCanonicalUrl } from "./entity-slug.js";

describe("createSlugFromCanonicalUrl", () => {
  it("uses hostname only for site root URLs", () => {
    assert.equal(createSlugFromCanonicalUrl("https://youtube.com/"), "youtube-com");
  });

  it("includes pathname for nested pages", () => {
    assert.equal(
      createSlugFromCanonicalUrl("https://twitch.tv/somechannel"),
      "twitch-tv-somechannel"
    );
  });

  it("includes query params so watch pages get unique slugs", () => {
    const first = createSlugFromCanonicalUrl("https://youtube.com/watch?v=abc123");
    const second = createSlugFromCanonicalUrl("https://youtube.com/watch?v=xyz789");

    assert.notEqual(first, second);
    assert.equal(first, "youtube-com-watch-v-abc123");
    assert.equal(second, "youtube-com-watch-v-xyz789");
  });
});
