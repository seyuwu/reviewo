import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PopupNavigation } from "./navigation.js";
import type { PopupScreenState } from "./types.js";

function screenName(navigation: PopupNavigation): PopupScreenState["name"] {
  return navigation.current.name;
}

describe("PopupNavigation", () => {
  it("supports home, search, entity, and back navigation", () => {
    const navigation = new PopupNavigation();

    assert.equal(screenName(navigation), "HOME");

    navigation.openSearch("github");
    assert.equal(screenName(navigation), "SEARCH");

    navigation.openEntity(
      {
        canonicalUrl: "https://github.com/",
        entityId: "entity-id",
        entityPagePath: "/entities/entity-id",
        pageUrl: "https://github.com/",
        status: "found",
        title: "GitHub"
      },
      "SEARCH"
    );

    assert.equal(screenName(navigation), "ENTITY");
    navigation.goBack();
    assert.equal(screenName(navigation), "SEARCH");
    navigation.goBack();
    assert.equal(screenName(navigation), "HOME");
  });

  it("replaces search query on the same screen", () => {
    const navigation = new PopupNavigation();
    navigation.openSearch("youtube");
    navigation.replaceSearch("github");

    assert.equal(screenName(navigation), "SEARCH");
    assert.equal(
      navigation.current.name === "SEARCH" ? navigation.current.query : "",
      "github"
    );
  });
});
