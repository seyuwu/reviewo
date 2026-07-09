import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildForkTopTitle,
  MAX_TOP_TITLE_LENGTH,
  normalizeForkSourceTitle,
  resolveForkAuthorLabel
} from "./build-fork-top-title.js";

describe("resolveForkAuthorLabel", () => {
  it("prefers username over display name", () => {
    assert.equal(
      resolveForkAuthorLabel({
        displayName: "Display Name",
        username: "nick"
      }),
      "nick"
    );
  });

  it("falls back to display name", () => {
    assert.equal(
      resolveForkAuthorLabel({
        displayName: "Display Name",
        username: null
      }),
      "Display Name"
    );
  });
});

describe("buildForkTopTitle", () => {
  it("appends fork suffix with author label", () => {
    assert.equal(buildForkTopTitle("Best AI Tools", "anton"), "Best AI Tools (версия anton)");
  });

  it("strips legacy fork suffix before appending a new one", () => {
    assert.equal(
      buildForkTopTitle("Best AI Tools (моя версия)", "anton"),
      "Best AI Tools (версия anton)"
    );
  });

  it("strips legacy fork suffix with dash before appending a new one", () => {
    assert.equal(
      buildForkTopTitle("Best AI Tools (версия - bob)", "anton"),
      "Best AI Tools (версия anton)"
    );
  });

  it("truncates long source titles to stay within max length", () => {
    const sourceTitle = "A".repeat(MAX_TOP_TITLE_LENGTH);
    const title = buildForkTopTitle(sourceTitle, "nick");

    assert.equal(title.length, MAX_TOP_TITLE_LENGTH);
    assert.match(title, /\(версия nick\)$/);
  });
});
