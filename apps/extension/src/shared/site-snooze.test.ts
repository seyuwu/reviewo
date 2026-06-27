import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readSiteHostname } from "./site-snooze.js";

describe("readSiteHostname", () => {
  it("normalizes hostnames for site snooze keys", () => {
    assert.equal(readSiteHostname("https://www.YouTube.com/watch?v=abc"), "youtube.com");
    assert.equal(readSiteHostname("https://github.com/org/repo"), "github.com");
  });
});
