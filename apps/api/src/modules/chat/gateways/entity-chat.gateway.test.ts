import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createOriginMatcher } from "../../../config/origin-policy.js";
import { roomName } from "./entity-chat.gateway.js";

describe("EntityChatGateway", () => {
  it("uses entityId as the websocket room id", () => {
    const entityId = "22222222-2222-4222-8222-222222222222";

    assert.equal(roomName(entityId), `entity:${entityId}`);
  });

  it("allows only configured websocket origins", () => {
    const isAllowedOrigin = createOriginMatcher([
      "http://localhost:3001",
      "chrome-extension://*"
    ]);

    assert.equal(isAllowedOrigin("http://localhost:3001"), true);
    assert.equal(isAllowedOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"), true);
    assert.equal(isAllowedOrigin("https://attacker.example"), false);
  });
});
