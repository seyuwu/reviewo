import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { verifyTelegramLoginPayload, type TelegramLoginPayload } from "./telegram-login.js";

const botToken = "123456:telegram_bot_token_for_test_only_123456789";
const nowSeconds = 1_800_000_000;

function signedPayload(overrides: Partial<TelegramLoginPayload> = {}): TelegramLoginPayload {
  const payload: TelegramLoginPayload = {
    auth_date: String(nowSeconds),
    first_name: "Player",
    hash: "",
    id: "123456789",
    username: "player",
    ...overrides
  };
  const checkString = Object.entries(payload)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  payload.hash = createHmac("sha256", secretKey).update(checkString).digest("hex");
  return payload;
}

describe("Telegram Login URL authorization", () => {
  it("accepts a valid recent authorization payload", () => {
    assert.equal(verifyTelegramLoginPayload(signedPayload(), botToken, nowSeconds), true);
  });

  it("rejects modified, stale, and future-dated payloads", () => {
    const payload = signedPayload();
    assert.equal(
      verifyTelegramLoginPayload({ ...payload, first_name: "Attacker" }, botToken, nowSeconds),
      false
    );
    assert.equal(
      verifyTelegramLoginPayload(
        signedPayload({ auth_date: String(nowSeconds - 301) }),
        botToken,
        nowSeconds
      ),
      false
    );
    assert.equal(
      verifyTelegramLoginPayload(
        signedPayload({ auth_date: String(nowSeconds + 31) }),
        botToken,
        nowSeconds
      ),
      false
    );
  });
});
