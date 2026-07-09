import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEntityInitials,
  renderEntityAvatarMarkup,
  resolveEntityAvatarCandidates
} from "./entity-avatar.js";

describe("entity-avatar", () => {
  it("resolves favicon candidates from canonical url", () => {
    const candidates = resolveEntityAvatarCandidates(null, "https://github.com/repo", "md");

    assert.ok(candidates.some((url) => url.includes("google.com/s2/favicons")));
    assert.ok(candidates.some((url) => url.endsWith("/favicon.ico")));
  });

  it("prefers logoUrl when provided", () => {
    const candidates = resolveEntityAvatarCandidates(
      "https://cdn.example.com/logo.png",
      "https://github.com",
      "md"
    );

    assert.equal(candidates[0], "https://cdn.example.com/logo.png");
  });

  it("renders initials fallback without image source", () => {
    const markup = renderEntityAvatarMarkup({
      canonicalUrl: null,
      title: "Unknown"
    });

    assert.match(markup, /entity-avatar-initials/);
    assert.doesNotMatch(markup, /<img/);
  });

  it("renders image markup with candidate list", () => {
    const markup = renderEntityAvatarMarkup({
      canonicalUrl: "https://youtube.com",
      title: "YouTube",
      size: "sm"
    });

    assert.match(markup, /entity-avatar-sm/);
    assert.match(markup, /data-avatar-candidates=/);
    assert.match(markup, /<img/);
  });

  it("derives hostname initials", () => {
    assert.equal(getEntityInitials("GitHub - repo", "https://github.com/repo"), "GI");
  });
});
