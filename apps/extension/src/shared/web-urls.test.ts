import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBattlesUrl,
  buildEntityTopsUrl,
  buildUserTopsUrl
} from "./web-urls.js";

describe("extension web-urls", () => {
  it("buildUserTopsUrl appends locale query", () => {
    assert.match(buildUserTopsUrl("en"), /\/tops\?locale=en$/);
  });

  it("buildBattlesUrl appends locale query", () => {
    assert.match(buildBattlesUrl("ru"), /\/battles\?locale=ru$/);
  });

  it("buildEntityTopsUrl keeps entity hash and locale query", () => {
    assert.match(buildEntityTopsUrl("abc", "en"), /\/entities\/abc#entity-user-tops\?locale=en$/);
  });
});
