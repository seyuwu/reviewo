import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ENTITY_CHAT_CLIENT_MAX_MESSAGES,
  appendEntityChatMessageNewest,
  mergeEntityChatMessagesNewest,
  prependEntityChatMessagesOldest,
  trimEntityChatMessagesNewest,
  trimEntityChatMessagesOldest
} from "../dist/entity-chat-messages.js";

function msg(id: string) {
  return { id, text: `message-${id}` };
}

describe("entity chat message buffers", () => {
  it("trimEntityChatMessagesNewest keeps the newest window", () => {
    const input = ["a", "b", "c", "d", "e"];

    assert.deepEqual(trimEntityChatMessagesNewest(input, 3), ["c", "d", "e"]);
  });

  it("trimEntityChatMessagesOldest keeps the oldest window", () => {
    const input = ["a", "b", "c", "d", "e"];

    assert.deepEqual(trimEntityChatMessagesOldest(input, 3), ["a", "b", "c"]);
  });

  it("mergeEntityChatMessagesNewest appends unique ids and trims newest", () => {
    const current = [msg("1"), msg("2")];
    const incoming = [msg("2"), msg("3"), msg("4")];

    assert.deepEqual(
      mergeEntityChatMessagesNewest(current, incoming, 3).map((item) => item.id),
      ["2", "3", "4"]
    );
  });

  it("prependEntityChatMessagesOldest prepends unique ids and trims oldest window at cap", () => {
    const current = [msg("3"), msg("4"), msg("5")];
    const older = [msg("1"), msg("2"), msg("3")];

    assert.deepEqual(
      prependEntityChatMessagesOldest(current, older, 4).map((item) => item.id),
      ["1", "2", "3", "4"]
    );
  });

  it("prependEntityChatMessagesOldest drops newest items when over cap", () => {
    const current = Array.from({ length: ENTITY_CHAT_CLIENT_MAX_MESSAGES }, (_, index) =>
      msg(String(index + 51))
    );
    const older = [msg("1"), msg("2")];

    const result = prependEntityChatMessagesOldest(current, older, ENTITY_CHAT_CLIENT_MAX_MESSAGES);

    assert.equal(result.length, ENTITY_CHAT_CLIENT_MAX_MESSAGES);
    assert.equal(result[0]?.id, "1");
    assert.equal(result[1]?.id, "2");
    assert.equal(result.at(-1)?.id, "348");
  });

  it("appendEntityChatMessageNewest ignores duplicate ids", () => {
    const current = [msg("1"), msg("2")];

    assert.deepEqual(
      appendEntityChatMessageNewest(current, msg("2")).map((item) => item.id),
      ["1", "2"]
    );
  });
});
