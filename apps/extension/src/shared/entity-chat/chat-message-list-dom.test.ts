import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  POPUP_CHAT_MESSAGE_LIST_DOM,
  renderChatMessageListItemHtml
} from "./chat-message-list-dom.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

describe("chat message list DOM", () => {
  it("escapes chat message text and author names", () => {
    const markup = renderChatMessageListItemHtml(
      {
        displayName: `<img src=x onerror="alert(1)">`,
        id: `review-"><script>`,
        message: `<img src=x onerror="alert(1)">`
      },
      POPUP_CHAT_MESSAGE_LIST_DOM,
      escapeHtml
    );

    assert.equal(markup.includes("<img"), false);
    assert.equal(markup.includes("<script"), false);
    assert.ok(markup.includes("&lt;img"));
  });
});
