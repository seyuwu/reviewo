import type { ExtensionEntityChildItem } from "../../shared/types/children.js";
import type { ExtensionResolveEntityBundle } from "../../shared/types/resolve.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import type { EntityViewModel } from "../types.js";

export function isLikelySiteRootCanonicalUrl(canonical: string): boolean {
  try {
    const url = new URL(canonical);

    return url.pathname === "/" || url.pathname === "";
  } catch {
    return false;
  }
}

export function getDomainTreeRoot(
  result: ExtensionResolveFoundResponse
): ExtensionResolveEntityBundle | null {
  if (result.parent) {
    return result.parent;
  }

  if (isLikelySiteRootCanonicalUrl(result.url.canonical)) {
    return {
      entity: result.entity,
      rating: result.rating,
      trust: result.trust,
      web: result.web
    };
  }

  return null;
}

export function entityViewFromChildItem(child: ExtensionEntityChildItem): EntityViewModel {
  return {
    avgScore: child.rating.avgScore,
    canonicalUrl: child.entity.canonicalUrl ?? "",
    entityId: child.entity.id,
    entityPagePath: child.web.entityPagePath,
    pageUrl: child.entity.canonicalUrl ?? "",
    status: "found",
    title: child.entity.title,
    votesCount: child.rating.votesCount
  };
}

export function entityViewFromParentBundle(
  parent: ExtensionResolveEntityBundle
): EntityViewModel {
  return {
    avgScore: parent.rating.avgScore,
    canonicalUrl: parent.entity.canonicalUrl ?? "",
    entityId: parent.entity.id,
    entityPagePath: parent.web.entityPagePath,
    pageUrl: parent.entity.canonicalUrl ?? "",
    status: "found",
    title: parent.entity.title,
    trustConfidence: parent.trust.confidence,
    votesCount: parent.rating.votesCount
  };
}

export function shortenCanonicalUrlForTree(canonicalUrl: string | null): string {
  if (!canonicalUrl) {
    return "Unknown page";
  }

  try {
    const url = new URL(canonicalUrl);
    const path = url.pathname === "/" ? "" : url.pathname;
    const suffix = url.search ? url.search : "";

    return `${url.hostname}${path}${suffix}`;
  } catch {
    return canonicalUrl;
  }
}
