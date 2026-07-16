import assert from "node:assert/strict";
import test from "node:test";

import { resolveSharedAuthCookieDomain } from "../../features/auth/lib/auth-session-cookie.ts";

function subdomainHomeUrl(siteUrl, subdomain) {
  const site = new URL(siteUrl);

  if (site.hostname === "opinia.ru" || site.hostname === "www.opinia.ru") {
    return `${site.protocol}//${subdomain}.opinia.ru/`;
  }

  return `${site.origin}/games/search`;
}

function dotaPublicOrigin(siteUrl) {
  const site = new URL(siteUrl);

  if (site.hostname === "opinia.ru" || site.hostname === "www.opinia.ru") {
    return `${site.protocol}//dota.opinia.ru`;
  }

  return site.origin;
}

test("games and dota entry from production site URL", () => {
  assert.equal(subdomainHomeUrl("https://opinia.ru", "games"), "https://games.opinia.ru/");
  assert.equal(subdomainHomeUrl("https://opinia.ru", "dota"), "https://dota.opinia.ru/");
  assert.equal(subdomainHomeUrl("https://www.opinia.ru", "dota"), "https://dota.opinia.ru/");
});

test("dota public origin for share URLs", () => {
  assert.equal(dotaPublicOrigin("https://opinia.ru"), "https://dota.opinia.ru");
  assert.equal(dotaPublicOrigin("https://www.opinia.ru"), "https://dota.opinia.ru");
  assert.equal(dotaPublicOrigin("http://localhost:3001"), "http://localhost:3001");
});

test("local site URL stays same-origin", () => {
  assert.equal(subdomainHomeUrl("http://localhost:3001", "games"), "http://localhost:3001/games/search");
  assert.equal(subdomainHomeUrl("http://localhost:3001", "dota"), "http://localhost:3001/games/search");
});

test("games and dota hosts share cookie domain with apex", () => {
  const domain = resolveSharedAuthCookieDomain("opinia.ru");
  assert.equal(resolveSharedAuthCookieDomain("games.opinia.ru"), domain);
  assert.equal(resolveSharedAuthCookieDomain("dota.opinia.ru"), domain);
});
