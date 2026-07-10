import { extensionConfig } from "../shared/config.js";
import type { ContentLocaleParam } from "@reviewo/shared";
import {
  buildBattlesUrl,
  buildEntityTopsUrl,
  buildUserTopsUrl
} from "../shared/web-urls.js";
import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";
import type { SearchEntityResult } from "./services/search-entities.js";
import type { EntityViewModel } from "./types.js";
import { deriveTitleFromCanonicalUrl } from "../content/rating-card/title-from-url.js";

export function buildEntityPageUrl(entityPagePath: string): string {
  return new URL(entityPagePath, extensionConfig.webBaseUrl).toString();
}

export function buildGlobalTopsUrl(): string {
  return new URL("/top", extensionConfig.webBaseUrl).toString();
}

export function buildLocaleAwareUserTopsUrl(locale?: ContentLocaleParam): string {
  return buildUserTopsUrl(locale);
}

export function buildLocaleAwareBattlesUrl(locale?: ContentLocaleParam): string {
  return buildBattlesUrl(locale);
}

export function buildLocaleAwareEntityTopsUrl(entityId: string, locale?: ContentLocaleParam): string {
  return buildEntityTopsUrl(entityId, locale);
}

export function entityViewFromResolve(
  pageUrl: string,
  result: ExtensionResolveResponse,
  pageTitle?: string
): EntityViewModel {
  if (result.status === "found") {
    const displayTitle =
      pageTitle && isGenericStoredEntityTitle(result.entity.title, result.url.canonical)
        ? pageTitle
        : result.entity.title;

    return {
      avgScore: result.rating.avgScore,
      canonicalUrl: result.url.canonical,
      entityId: result.entity.id,
      entityPagePath: result.web.entityPagePath,
      pageUrl,
      status: "found",
      title: displayTitle,
      trustConfidence: result.trust.confidence,
      votesCount: result.rating.votesCount,
      ...(pageTitle ? { pageTitle } : {}),
      ...(result.parent
        ? {
            parentEntityId: result.parent.entity.id,
            parentEntityPagePath: result.parent.web.entityPagePath,
            parentTitle: result.parent.entity.title
          }
        : {})
    };
  }

  return {
    canonicalUrl: result.url.canonical,
    pageUrl,
    status: "not_found",
    title: pageTitle ?? deriveTitleFromCanonicalUrl(result.url.canonical),
    ...(pageTitle ? { pageTitle } : {})
  };
}

function isGenericStoredEntityTitle(entityTitle: string, canonicalUrl: string): boolean {
  const normalizedTitle = entityTitle.trim().toLowerCase();

  if (!normalizedTitle) {
    return true;
  }

  const hostname = deriveTitleFromCanonicalUrl(canonicalUrl).toLowerCase();

  return (
    normalizedTitle === hostname ||
    normalizedTitle === `www.${hostname}` ||
    normalizedTitle === hostname.split(".")[0]
  );
}

export function entityViewFromSearchResult(result: SearchEntityResult): EntityViewModel {
  return {
    canonicalUrl: result.canonicalUrl ?? "",
    entityId: result.id,
    entityPagePath: `/entities/${result.id}`,
    pageUrl: result.canonicalUrl ?? "",
    status: "found",
    title: result.title
  };
}

export function formatAccountLabel(session: ExtensionStoredAuthSession | null): string {
  if (!session) {
    return "Sign in";
  }

  return session.displayName;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
