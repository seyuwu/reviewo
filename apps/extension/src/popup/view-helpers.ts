import { extensionConfig } from "../shared/config.js";
import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";
import type { SearchEntityResult } from "./services/search-entities.js";
import type { EntityViewModel } from "./types.js";
import { deriveTitleFromCanonicalUrl } from "../content/rating-card/title-from-url.js";

export function buildEntityPageUrl(entityPagePath: string): string {
  return new URL(entityPagePath, extensionConfig.webBaseUrl).toString();
}

export function entityViewFromResolve(
  pageUrl: string,
  result: ExtensionResolveResponse
): EntityViewModel {
  if (result.status === "found") {
    return {
      avgScore: result.rating.avgScore,
      canonicalUrl: result.url.canonical,
      entityId: result.entity.id,
      entityPagePath: result.web.entityPagePath,
      pageUrl,
      status: "found",
      title: result.entity.title,
      trustConfidence: result.trust.confidence,
      votesCount: result.rating.votesCount,
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
    title: deriveTitleFromCanonicalUrl(result.url.canonical)
  };
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
