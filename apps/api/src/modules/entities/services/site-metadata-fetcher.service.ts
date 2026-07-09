import { Injectable } from "@nestjs/common";

import { tryAssertSafeHttpUrl } from "../../../common/validation/assert-safe-http-url.js";
import { safeExternalFetch, type SafeExternalFetchOptions } from "../../../common/http/safe-external-fetch.js";

export interface SiteMetadata {
  faviconUrl: string | null;
  ogImageUrl: string | null;
}

export interface SiteMetadataFetcherOptions {
  fetchImpl?: typeof fetch;
}

@Injectable()
export class SiteMetadataFetcherService {
  async fetchMetadata(
    canonicalUrl: string,
    options: SiteMetadataFetcherOptions = {}
  ): Promise<SiteMetadata> {
    const fetchOptions: SafeExternalFetchOptions = {};

    if (options.fetchImpl) {
      fetchOptions.fetchImpl = options.fetchImpl;
    }

    const { body, finalUrl } = await safeExternalFetch(canonicalUrl, fetchOptions);

    return {
      faviconUrl: extractFaviconUrl(body, finalUrl),
      ogImageUrl: extractOgImageUrl(body, finalUrl)
    };
  }
}

function extractOgImageUrl(html: string, baseUrl: string): string | null {
  const metaTags = [
    extractMetaContent(html, "property", "og:image"),
    extractMetaContent(html, "property", "og:image:url"),
    extractMetaContent(html, "name", "twitter:image"),
    extractMetaContent(html, "name", "twitter:image:src")
  ];

  for (const candidate of metaTags) {
    const resolved = resolveMaybeRelativeUrl(candidate, baseUrl);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function extractFaviconUrl(html: string, baseUrl: string): string | null {
  const iconCandidates = [
    extractLinkHref(html, "apple-touch-icon"),
    extractLinkHref(html, "icon"),
    extractLinkHref(html, "shortcut icon")
  ];

  for (const candidate of iconCandidates) {
    const resolved = resolveMaybeRelativeUrl(candidate, baseUrl);

    if (resolved) {
      return resolved;
    }
  }

  try {
    const origin = new URL(baseUrl).origin;

    return tryAssertSafeHttpUrl(`${origin}/favicon.ico`);
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, attribute: "name" | "property", value: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapeRegExp(value)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*${attribute}=["']${escapeRegExp(value)}["'][^>]*>`,
    "i"
  );

  return pattern.exec(html)?.[1]?.trim() ?? reversePattern.exec(html)?.[1]?.trim() ?? null;
}

function extractLinkHref(html: string, relValue: string): string | null {
  const pattern = new RegExp(
    `<link[^>]+rel=["'][^"']*${escapeRegExp(relValue)}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reversePattern = new RegExp(
    `<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*${escapeRegExp(relValue)}[^"']*["'][^>]*>`,
    "i"
  );

  return pattern.exec(html)?.[1]?.trim() ?? reversePattern.exec(html)?.[1]?.trim() ?? null;
}

function resolveMaybeRelativeUrl(candidate: string | null, baseUrl: string): string | null {
  if (!candidate) {
    return null;
  }

  try {
    return tryAssertSafeHttpUrl(new URL(candidate, baseUrl).toString());
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
