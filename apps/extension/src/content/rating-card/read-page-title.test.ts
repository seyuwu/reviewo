import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGenericTwitchTitle, isTwitchPage, normalizePageSourceTitle } from "./read-page-title.js";

describe("readPageSourceTitle helpers", () => {
  it("detects Twitch pages", () => {
    assert.equal(isTwitchPage("https://www.twitch.tv/shroud"), true);
    assert.equal(isTwitchPage("https://youtube.com/watch?v=abc"), false);
  });

  it("treats bare Twitch titles as generic", () => {
    assert.equal(isGenericTwitchTitle("Twitch"), true);
    assert.equal(isGenericTwitchTitle("twitch.tv"), true);
    assert.equal(isGenericTwitchTitle("Shroud - Twitch"), false);
  });

  it("removes trailing YouTube suffix from page titles", () => {
    assert.equal(normalizePageSourceTitle("My Video - YouTube"), "My Video");
  });
});
