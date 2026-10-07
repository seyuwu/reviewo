import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesTelegramVerificationCode } from "./telegram-verification-code.js";

describe("matchesTelegramVerificationCode", () => {
  it("matches only the exact six-digit code", () => {
    assert.equal(matchesTelegramVerificationCode("123456", "123456"), true);
    assert.equal(matchesTelegramVerificationCode("123456", "123457"), false);
    assert.equal(matchesTelegramVerificationCode("123456", "12345"), false);
    assert.equal(matchesTelegramVerificationCode("123456", "1234567"), false);
    assert.equal(matchesTelegramVerificationCode("abcdef", "abcdef"), false);
  });
});
