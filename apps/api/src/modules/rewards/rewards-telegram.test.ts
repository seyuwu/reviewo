import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { readTelegramProfile, telegramUsername } from "./rewards-telegram.js";

describe("Telegram profile checks", () => {
  let old: string | undefined;
  beforeEach(() => {
    old = process.env["DOTA_BOT_TOKEN"];
    process.env["DOTA_BOT_TOKEN"] = "fixture-secret";
  });
  afterEach(() => {
    mock.restoreAll();
    if (old) process.env["DOTA_BOT_TOKEN"] = old;
    else delete process.env["DOTA_BOT_TOKEN"];
  });
  it("retries a timeout once and returns the actual name and username", async () => {
    let count = 0;
    mock.method(globalThis, "fetch", async () => {
      if (++count === 1) throw new DOMException("secret provider URL", "TimeoutError");
      return new Response(
        JSON.stringify({
          ok: true,
          result: { id: 101, first_name: "QA", last_name: "@FDPdotabot", username: "qa_player" }
        })
      );
    });
    assert.deepEqual(await readTelegramProfile("101"), {
      name: "QA @FDPdotabot",
      username: "qa_player"
    });
    assert.equal(count, 2);
  });
  it("bounds failed retries and removes provider details from errors", async () => {
    let count = 0;
    mock.method(globalThis, "fetch", async () => {
      count++;
      throw new TypeError("https://provider/botfixture-secret");
    });
    await assert.rejects(
      readTelegramProfile("101"),
      (error) =>
        error instanceof Error &&
        error.message === "NETWORK" &&
        !error.stack?.includes("fixture-secret")
    );
    assert.equal(count, 2);
  });
  it("does not retry provider rate limits or inaccessible profiles", async () => {
    for (const [status, code] of [
      [429, "RATE_LIMIT"],
      [403, "PROFILE_UNAVAILABLE"],
      [401, "CONFIGURATION"]
    ] as const) {
      const request = mock.method(globalThis, "fetch", async () => new Response("{}", { status }));
      await assert.rejects(readTelegramProfile("101"), { code });
      assert.equal(request.mock.callCount(), 1);
      request.mock.restore();
    }
  });
  it("rejects mismatched identities and malformed JSON without retrying", async () => {
    for (const body of [
      "<invalid>",
      "null",
      JSON.stringify({ ok: true, result: { id: 202, first_name: "Wrong user" } })
    ]) {
      const request = mock.method(globalThis, "fetch", async () => new Response(body));
      await assert.rejects(readTelegramProfile("101"), { code: "INVALID_RESPONSE" });
      assert.equal(request.mock.callCount(), 1);
      request.mock.restore();
    }
  });
  it("retries transient server errors and clears missing usernames", async () => {
    let count = 0;
    mock.method(globalThis, "fetch", async () =>
      ++count === 1
        ? new Response("", { status: 503 })
        : new Response(JSON.stringify({ ok: true, result: { id: 101, first_name: "QA" } }))
    );
    assert.deepEqual(await readTelegramProfile("101"), { name: "QA", username: null });
  });
  it("accepts only safe profile usernames", () => {
    for (const value of [null, "../evil", "evil?start=123", "@username", "a".repeat(33)])
      assert.equal(telegramUsername(value), null);
    assert.equal(telegramUsername("qa_player"), "qa_player");
  });
});
