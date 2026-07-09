import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeExternalUrl } from "./safe-external-fetch.js";

describe("assertSafeExternalUrl", () => {
  it("rejects localhost hostnames", async () => {
    await assert.rejects(() => assertSafeExternalUrl("https://localhost/logo.png"), /not allowed/);
  });

  it("rejects decimal loopback IP literals", async () => {
    await assert.rejects(() => assertSafeExternalUrl("http://2130706433/"), /not allowed/);
  });

  it("rejects metadata hostnames", async () => {
    await assert.rejects(
      () => assertSafeExternalUrl("http://metadata.google.internal/computeMetadata/v1/"),
      /not allowed/
    );
  });

  it("accepts public hostnames", async () => {
    const url = await assertSafeExternalUrl("https://example.com/page");

    assert.equal(url.hostname, "example.com");
  });
});
