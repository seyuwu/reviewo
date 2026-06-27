import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGenericYouTubeTitle } from "./youtube-page-state.js";

describe("page content ready", () => {
  it("treats bare YouTube document titles as generic", () => {
    assert.equal(isGenericYouTubeTitle(""), true);
    assert.equal(isGenericYouTubeTitle("YouTube"), true);
    assert.equal(isGenericYouTubeTitle("- YouTube"), true);
    assert.equal(isGenericYouTubeTitle("Example video - YouTube"), false);
  });
});
