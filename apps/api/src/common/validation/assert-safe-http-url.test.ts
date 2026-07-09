import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeHttpUrl, tryAssertSafeHttpUrl } from "./assert-safe-http-url.js";

describe("assertSafeHttpUrl", () => {
  it("accepts valid https URLs", () => {
    assert.equal(assertSafeHttpUrl("https://example.com/logo.png"), "https://example.com/logo.png");
  });

  it("accepts valid http URLs", () => {
    assert.equal(assertSafeHttpUrl("http://example.com/favicon.ico"), "http://example.com/favicon.ico");
  });

  it("rejects javascript URLs", () => {
    assert.throws(() => assertSafeHttpUrl("javascript:alert(1)"), /HTTP or HTTPS/);
  });

  it("rejects data URLs", () => {
    assert.throws(() => assertSafeHttpUrl("data:text/html,<script>alert(1)</script>"), /HTTP or HTTPS/);
  });

  it("rejects overly long URLs", () => {
    assert.throws(() => assertSafeHttpUrl(`https://example.com/${"a".repeat(2048)}`), /at most/);
  });

  it("returns null from tryAssertSafeHttpUrl for invalid input", () => {
    assert.equal(tryAssertSafeHttpUrl("javascript:alert(1)"), null);
  });
});
