import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveApiEndpoint } from "./api-request.js";

const API_BASE = "http://localhost:3000";

describe("resolveApiEndpoint", () => {
  it("resolves relative API paths against the configured base URL", () => {
    const endpoint = resolveApiEndpoint("/reviews/entities/abc", API_BASE);

    assert.equal(endpoint.origin, "http://localhost:3000");
    assert.equal(endpoint.pathname, "/reviews/entities/abc");
  });

  it("rejects absolute off-origin URLs", () => {
    assert.throws(
      () => resolveApiEndpoint("https://evil.example/steal", API_BASE),
      /configured API origin/
    );
  });

  it("rejects protocol-relative URLs", () => {
    assert.throws(
      () => resolveApiEndpoint("//evil.example/steal", API_BASE),
      /Protocol-relative/
    );
  });

  it("rejects empty paths", () => {
    assert.throws(() => resolveApiEndpoint("   ", API_BASE), /required/);
  });
});
