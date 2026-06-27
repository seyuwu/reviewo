import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  shouldApplyWebAuthToExtension,
  shouldClearExtensionSessionOn401,
  shouldPullExtensionAuthToWeb,
  shouldPushWebAuthToExtension
} from "./web-auth-sync-policy.js";

describe("shouldPushWebAuthToExtension", () => {
  it("never pushes empty web auth to the extension", () => {
    assert.equal(shouldPushWebAuthToExtension(null, undefined), false);
    assert.equal(shouldPushWebAuthToExtension(null, "token"), false);
  });

  it("pushes only when web auth changed to a non-empty value", () => {
    assert.equal(shouldPushWebAuthToExtension('{"accessToken":"a"}', undefined), true);
    assert.equal(shouldPushWebAuthToExtension('{"accessToken":"a"}', '{"accessToken":"a"}'), false);
    assert.equal(shouldPushWebAuthToExtension('{"accessToken":"b"}', '{"accessToken":"a"}'), true);
  });
});

describe("shouldApplyWebAuthToExtension", () => {
  it("rejects invalid web tokens", () => {
    assert.equal(
      shouldApplyWebAuthToExtension({
        currentExtensionAccessToken: null,
        extensionTokenValid: false,
        webAccessToken: "web",
        webTokenValid: false
      }),
      false
    );
  });

  it("applies valid web auth when the extension has no session", () => {
    assert.equal(
      shouldApplyWebAuthToExtension({
        currentExtensionAccessToken: null,
        extensionTokenValid: false,
        webAccessToken: "web",
        webTokenValid: true
      }),
      true
    );
  });

  it("does not overwrite a valid extension session with a different web token", () => {
    assert.equal(
      shouldApplyWebAuthToExtension({
        currentExtensionAccessToken: "extension",
        extensionTokenValid: true,
        webAccessToken: "web",
        webTokenValid: true
      }),
      false
    );
  });
});

describe("shouldClearExtensionSessionOn401", () => {
  it("never clears the session by default", () => {
    assert.equal(shouldClearExtensionSessionOn401({ method: "PUT" }), false);
    assert.equal(shouldClearExtensionSessionOn401({ method: "GET" }), false);
  });

  it("clears only when explicitly requested", () => {
    assert.equal(
      shouldClearExtensionSessionOn401({
        clearSessionOnUnauthorized: true,
        method: "GET"
      }),
      true
    );
  });
});

describe("web sign-out sync", () => {
  it("does not pull extension auth after a local web sign-out", () => {
    assert.equal(shouldPullExtensionAuthToWeb({ webSignedOutLocally: true }), false);
    assert.equal(shouldPullExtensionAuthToWeb({ webSignedOutLocally: false }), true);
  });
});
