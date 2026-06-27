import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readPageIdentity } from "./page-identity.js";

describe("readPageIdentity", () => {
  it("tracks YouTube watch URLs by video id", () => {
    assert.equal(
      readPageIdentity("https://www.youtube.com/watch?v=abc123&t=42"),
      "youtube:video:abc123"
    );
    assert.equal(
      readPageIdentity("https://www.youtube.com/watch?v=def456&list=PL_test"),
      "youtube:video:def456"
    );
  });

  it("tracks YouTube shorts and live URLs", () => {
    assert.equal(
      readPageIdentity("https://youtube.com/shorts/short123"),
      "youtube:video:short123"
    );
    assert.equal(readPageIdentity("https://youtube.com/live/live123"), "youtube:video:live123");
  });

  it("tracks youtu.be short links", () => {
    assert.equal(readPageIdentity("https://youtu.be/abc123"), "youtube:video:abc123");
  });

  it("falls back to full URL for regular pages", () => {
    assert.equal(
      readPageIdentity("https://example.com/docs/guide#section"),
      "https://example.com/docs/guide"
    );
  });
});
