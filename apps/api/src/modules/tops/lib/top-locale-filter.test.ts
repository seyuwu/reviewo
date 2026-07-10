import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTopLocaleWhere } from "./top-locale-filter.js";

describe("buildTopLocaleWhere", () => {
  it("scopes tops to a single locale when requested", () => {
    assert.deepEqual(buildTopLocaleWhere({ locale: "en" }), {
      locale: "en"
    });
  });

  it("returns no locale filter when locale is all", () => {
    assert.deepEqual(buildTopLocaleWhere({ locale: "all" }), {});
  });

  it("defaults to all locales when filter is omitted", () => {
    assert.deepEqual(buildTopLocaleWhere(), {});
  });
});
