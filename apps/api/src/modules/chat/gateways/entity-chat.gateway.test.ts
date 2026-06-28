import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roomName } from "./entity-chat.gateway.js";

describe("EntityChatGateway", () => {
  it("uses entityId as the websocket room id", () => {
    const entityId = "22222222-2222-4222-8222-222222222222";

    assert.equal(roomName(entityId), `entity:${entityId}`);
  });
});
