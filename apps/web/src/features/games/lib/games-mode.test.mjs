import assert from "node:assert/strict";
import test from "node:test";

function isGamesVerticalHostname(hostname) {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  return (
    host === "games.opinia.ru" ||
    host === "dota.opinia.ru" ||
    host === "games.localhost" ||
    host === "dota.localhost"
  );
}

function isGamesModePath(pathname) {
  return pathname === "/games" || pathname.startsWith("/games/") || pathname.startsWith("/dota");
}

function isGamesProductMode(pathname, hostname) {
  if (isGamesModePath(pathname)) {
    return true;
  }

  if (hostname && isGamesVerticalHostname(hostname)) {
    return true;
  }

  return false;
}

function safeInternalNextPath(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return null;
  }

  if (trimmed.includes("://") || trimmed.includes("\\") || trimmed.includes("@")) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(trimmed);

    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("://") ||
      decoded.includes("\\")
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const withoutHash = trimmed.split("#")[0] ?? trimmed;
  return withoutHash.length > 0 ? withoutHash : null;
}

test("path drives games mode on localhost", () => {
  assert.equal(isGamesProductMode("/games/search", "localhost"), true);
  assert.equal(isGamesProductMode("/profile", "localhost"), false);
});

test("games host keeps /profile in games mode", () => {
  assert.equal(isGamesProductMode("/profile", "games.opinia.ru"), true);
  assert.equal(isGamesProductMode("/profile", "dota.opinia.ru"), true);
  assert.equal(isGamesProductMode("/profile", "opinia.ru"), false);
});

test("safeInternalNextPath allows relative paths", () => {
  assert.equal(safeInternalNextPath("/games/search"), "/games/search");
  assert.equal(safeInternalNextPath("/dota/create?x=1"), "/dota/create?x=1");
});

test("safeInternalNextPath rejects open redirects", () => {
  assert.equal(safeInternalNextPath("//evil.com"), null);
  assert.equal(safeInternalNextPath("https://evil.com"), null);
  assert.equal(safeInternalNextPath("/\\evil.com"), null);
  assert.equal(safeInternalNextPath("/%2f%2fevil.com"), null);
  assert.equal(safeInternalNextPath("/@evil"), null);
});
