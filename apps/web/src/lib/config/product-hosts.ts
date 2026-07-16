import { publicEnv } from "./public-env";

function siteUrl(): URL {
  try {
    return new URL(publicEnv.siteUrl);
  } catch {
    return new URL("https://opinia.ru/");
  }
}

function isProductionApexHost(hostname: string): boolean {
  return hostname === "opinia.ru" || hostname === "www.opinia.ru";
}

function subdomainHomeUrl(subdomain: "games" | "dota"): string {
  const site = siteUrl();

  if (isProductionApexHost(site.hostname)) {
    return `${site.protocol}//${subdomain}.opinia.ru/`;
  }

  // Local / preview: keep same-origin paths (no subdomain DNS required).
  return `${site.origin}/games/search`;
}

/** Absolute OpinIA home (apex site). */
export function getOpiniaHomeUrl(): string {
  return `${siteUrl().origin}/`;
}

/** Absolute Games host root (middleware → `/games/search`). */
export function getGamesHomeUrl(): string {
  return subdomainHomeUrl("games");
}

/** Absolute Dota host root (middleware → `/games/search` for now). */
export function getDotaHomeUrl(): string {
  return subdomainHomeUrl("dota");
}

/**
 * Origin for absolute Dota share / canonical / OG URLs.
 * Production: `https://dota.opinia.ru`. Local: same origin as `NEXT_PUBLIC_SITE_URL`.
 */
export function getDotaPublicOrigin(): string {
  const site = siteUrl();

  if (isProductionApexHost(site.hostname)) {
    return `${site.protocol}//dota.opinia.ru`;
  }

  return site.origin;
}

/**
 * Brand-switcher “Opinia Games” entry.
 * Uses the Games host; Dota has its own CTAs on the OpinIA home.
 */
export function getGamesEntryUrl(): string {
  return getGamesHomeUrl();
}

export function isGamesVerticalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  return (
    host === "games.opinia.ru" ||
    host === "dota.opinia.ru" ||
    host === "games.localhost" ||
    host === "dota.localhost"
  );
}
