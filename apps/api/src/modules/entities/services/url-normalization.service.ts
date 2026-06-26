import { Injectable } from "@nestjs/common";

import type { UrlNormalizer } from "../interfaces/url-normalizer.js";

const TRACKING_QUERY_PARAMETERS = new Set([
  "_hsenc",
  "_hsmi",
  "fbclid",
  "gbraid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref",
  "ref_src",
  "si",
  "spm",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
  "wbraid",
  "yclid"
]);

@Injectable()
export class UrlNormalizationService implements UrlNormalizer {
  normalize(input: string): string | null {
    const url = parseHttpUrl(input);

    if (!url) {
      return null;
    }

    url.protocol = "https:";
    url.hostname = normalizeHostname(url.hostname);
    url.pathname = normalizePathname(url.pathname);
    url.hash = "";
    url.search = normalizeSearchParams(url.searchParams);

    return url.toString();
  }
}

function parseHttpUrl(input: string): URL | null {
  try {
    const trimmedInput = input.trim();
    const inputHasProtocol = hasProtocol(trimmedInput);

    if (!inputHasProtocol && !hasLikelyHostname(trimmedInput)) {
      return null;
    }

    const url = new URL(inputHasProtocol ? trimmedInput : `https://${trimmedInput}`);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function hasProtocol(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
}

function hasLikelyHostname(input: string): boolean {
  const hostname = input.split(/[/?#]/, 1)[0];

  return Boolean(hostname?.includes("."));
}

function normalizeHostname(hostname: string): string {
  const normalizedHostname = hostname.toLowerCase();

  return normalizedHostname.startsWith("www.") ? normalizedHostname.slice(4) : normalizedHostname;
}

function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/g, "");
}

function normalizeSearchParams(searchParams: URLSearchParams): string {
  const preservedEntries = Array.from(searchParams.entries())
    .filter(([key]) => !TRACKING_QUERY_PARAMETERS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);

      return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
    });

  const normalizedSearchParams = new URLSearchParams();

  for (const [key, value] of preservedEntries) {
    normalizedSearchParams.append(key, value);
  }

  const normalizedSearch = normalizedSearchParams.toString();

  return normalizedSearch ? `?${normalizedSearch}` : "";
}
