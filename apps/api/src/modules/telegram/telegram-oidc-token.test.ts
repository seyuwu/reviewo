import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyTelegramOidcToken } from "./telegram-oidc-token.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keys = [
  { ...publicKey.export({ format: "jwk" }), kid: "telegram-key", alg: "RS256", use: "sig" }
];
const now = 1791300000;
const request = { clientId: "123456789", nonce: "nonce-for-this-browser", createdAt: now - 5 };
const claims = {
  iss: "https://oauth.telegram.org",
  aud: request.clientId,
  nonce: request.nonce,
  sub: "a-distinct-oidc-subject",
  id: 987654321,
  preferred_username: "fdp_player",
  iat: now,
  exp: now + 3600
};
function token(
  payload = claims,
  header: Record<string, unknown> = { alg: "RS256", kid: "telegram-key" }
) {
  const input = [header, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

describe("official Telegram identity verification", () => {
  it("verifies the signature and uses the Bot API id instead of the OIDC subject", () => {
    assert.deepEqual(verifyTelegramOidcToken(token(), request, keys, now), {
      id: "987654321",
      username: "fdp_player"
    });
  });
  it("rejects forged identity data and unknown signing keys", () => {
    const parts = token().split(".");
    parts[1] = Buffer.from(JSON.stringify({ ...claims, id: 1234 })).toString("base64url");
    assert.throws(() => verifyTelegramOidcToken(parts.join("."), request, keys, now));
    assert.throws(() => verifyTelegramOidcToken(token(), request, [], now));
  });
  it("rejects algorithm confusion and token-controlled key locations", () => {
    assert.throws(() =>
      verifyTelegramOidcToken(
        token(claims, { alg: "HS256", kid: "telegram-key" }),
        request,
        keys,
        now
      )
    );
    assert.throws(() =>
      verifyTelegramOidcToken(
        token(claims, { alg: "none", kid: "telegram-key" }),
        request,
        keys,
        now
      )
    );
    assert.throws(() =>
      verifyTelegramOidcToken(
        token(claims, { alg: "RS256", kid: "attacker", jku: "https://attacker.invalid" }),
        request,
        keys,
        now
      )
    );
  });
  it("rejects another website, another browser request, and another issuer", () => {
    for (const changes of [
      { aud: "another-bot" },
      { nonce: "another-request" },
      { iss: "https://attacker.invalid" }
    ])
      assert.throws(() =>
        verifyTelegramOidcToken(token({ ...claims, ...changes }), request, keys, now)
      );
  });
  it("rejects expired, pre-request, and future confirmations", () => {
    for (const changes of [{ exp: now }, { iat: now - 60 }, { iat: now + 60 }])
      assert.throws(() =>
        verifyTelegramOidcToken(token({ ...claims, ...changes }), request, keys, now)
      );
  });
  it("does not derive a Telegram ID from the username or subject", () => {
    assert.throws(() => verifyTelegramOidcToken(token({ ...claims, id: 0 }), request, keys, now));
  });
});
