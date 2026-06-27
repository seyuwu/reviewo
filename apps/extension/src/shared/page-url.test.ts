import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isResolvablePageUrl } from "./page-url.js";

describe("isResolvablePageUrl", () => {
  it("accepts HTTP and HTTPS page URLs", () => {
    assert.equal(isResolvablePageUrl("http://example.com/page"), true);
    assert.equal(isResolvablePageUrl("https://example.com/page"), true);
  });

  it("rejects non-web protocols and invalid URLs", () => {
    assert.equal(isResolvablePageUrl("chrome-extension://id/page"), false);
    assert.equal(isResolvablePageUrl("not-a-url"), false);
  });
});
