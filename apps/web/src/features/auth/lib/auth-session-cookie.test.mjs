import assert from "node:assert/strict";
import test from "node:test";

import {
  SHARED_AUTH_COOKIE_NAME,
  SHARED_SIGNED_OUT_COOKIE_NAME,
  clearSharedAuthSessionCookie,
  clearSharedSignedOutCookie,
  isSharedSignedOutCookie,
  readSharedAuthSessionCookie,
  resolveSharedAuthCookieDomain,
  writeSharedAuthSessionCookie,
  writeSharedSignedOutCookie
} from "./auth-session-cookie.ts";

const sampleSession = {
  accessToken: "header.payload.sig",
  avatarUrl: null,
  displayName: "Tester",
  email: "t@example.com",
  userId: "user-1"
};

test("resolveSharedAuthCookieDomain uses .opinia.ru for apex and subdomains", () => {
  assert.equal(resolveSharedAuthCookieDomain("opinia.ru"), ".opinia.ru");
  assert.equal(resolveSharedAuthCookieDomain("www.opinia.ru"), ".opinia.ru");
  assert.equal(resolveSharedAuthCookieDomain("games.opinia.ru"), ".opinia.ru");
  assert.equal(resolveSharedAuthCookieDomain("dota.opinia.ru"), ".opinia.ru");
  assert.equal(resolveSharedAuthCookieDomain("api.opinia.ru"), ".opinia.ru");
});

test("resolveSharedAuthCookieDomain uses .localhost for local hosts", () => {
  assert.equal(resolveSharedAuthCookieDomain("localhost"), ".localhost");
  assert.equal(resolveSharedAuthCookieDomain("games.localhost"), ".localhost");
  assert.equal(resolveSharedAuthCookieDomain("dota.localhost"), ".localhost");
});

test("resolveSharedAuthCookieDomain returns null for unrelated hosts", () => {
  assert.equal(resolveSharedAuthCookieDomain("example.com"), null);
  assert.equal(resolveSharedAuthCookieDomain(""), null);
});

test("writeSharedAuthSessionCookie sets Domain=.opinia.ru and Secure on https host", () => {
  const cookie = writeSharedAuthSessionCookie(sampleSession, {
    hostname: "dota.opinia.ru",
    maxAgeSeconds: 3600,
    secure: true
  });

  assert.match(cookie, new RegExp(`^${SHARED_AUTH_COOKIE_NAME}=`));
  assert.match(cookie, /Domain=\.opinia\.ru/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=3600/);
  assert.match(cookie, /Path=\//);
});

test("readSharedAuthSessionCookie round-trips session payload", () => {
  const written = writeSharedAuthSessionCookie(sampleSession, {
    hostname: "opinia.ru",
    maxAgeSeconds: 120,
    secure: true
  });
  const nameValue = written.split(";")[0] ?? "";
  const parsed = readSharedAuthSessionCookie(nameValue);

  assert.deepEqual(parsed, sampleSession);
});

test("writeSharedAuthSessionCookie strips avatarUrl to stay under cookie size limits", () => {
  const written = writeSharedAuthSessionCookie(
    {
      ...sampleSession,
      avatarUrl: `data:image/jpeg;base64,${"A".repeat(8_000)}`
    },
    {
      hostname: "opinia.ru",
      maxAgeSeconds: 120,
      secure: true
    }
  );
  const nameValue = written.split(";")[0] ?? "";
  const parsed = readSharedAuthSessionCookie(nameValue);

  assert.equal(parsed?.avatarUrl, null);
  assert.equal(parsed?.accessToken, sampleSession.accessToken);
  assert.ok(written.length < 4_000);
});

test("signed-out cookie helpers encode and detect flag", () => {
  const written = writeSharedSignedOutCookie({
    hostname: "games.opinia.ru",
    secure: true
  });
  const nameValue = written.split(";")[0] ?? "";

  assert.equal(isSharedSignedOutCookie(nameValue), true);
  assert.match(written, new RegExp(`${SHARED_SIGNED_OUT_COOKIE_NAME}=1`));
  assert.match(written, /Domain=\.opinia\.ru/);

  const cleared = clearSharedSignedOutCookie({
    hostname: "games.opinia.ru",
    secure: true
  });
  assert.match(cleared, /Max-Age=0/);
});

test("clearSharedAuthSessionCookie expires auth cookie", () => {
  const cleared = clearSharedAuthSessionCookie({
    hostname: "opinia.ru",
    secure: true
  });

  assert.match(cleared, new RegExp(`^${SHARED_AUTH_COOKIE_NAME}=;`));
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Domain=\.opinia\.ru/);
});
