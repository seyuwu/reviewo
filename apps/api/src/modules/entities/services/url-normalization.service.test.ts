import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UrlNormalizationService } from "./url-normalization.service.js";

describe("UrlNormalizationService", () => {
  const service = new UrlNormalizationService();

  it("normalizes HTTP URLs to HTTPS with lowercase host", () => {
    assert.equal(service.normalize("http://Example.COM/path"), "https://example.com/path");
  });

  it("removes leading www and trailing slashes on non-root paths", () => {
    assert.equal(service.normalize("https://www.example.com/about/"), "https://example.com/about");
  });

  it("keeps root trailing slash", () => {
    assert.equal(service.normalize("https://www.example.com/"), "https://example.com/");
  });

  it("removes tracking query params and sorts preserved params", () => {
    assert.equal(
      service.normalize("https://example.com/page?utm_source=x&tab=2&tab=1"),
      "https://example.com/page?tab=1&tab=2"
    );
  });

  it("removes hash fragments", () => {
    assert.equal(service.normalize("https://example.com/page#section"), "https://example.com/page");
  });

  it("accepts protocol-less URLs with likely hostname", () => {
    assert.equal(service.normalize("example.com/docs"), "https://example.com/docs");
  });

  it("returns null for invalid URLs", () => {
    assert.equal(service.normalize("not a url"), null);
    assert.equal(service.normalize("ftp://example.com"), null);
  });
});
