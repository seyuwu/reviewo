import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCompareSlug } from "@reviewo/shared";

import { resolveVoterKey } from "../../../common/voter-key.js";

describe("parseCompareSlug integration", () => {
  it("parses hyphenated right slug", () => {
    assert.deepEqual(parseCompareSlug("spotify-vs-youtube-music"), {
      leftSlug: "spotify",
      rightSlug: "youtube-music"
    });
  });
});

describe("resolveVoterKey", () => {
  it("hashes voter header values", () => {
    const first = resolveVoterKey("abc", { ip: "127.0.0.1" });
    const second = resolveVoterKey("abc", { ip: "127.0.0.1" });

    assert.equal(first, second);
    assert.notEqual(first, resolveVoterKey("def", { ip: "127.0.0.1" }));
  });
});
