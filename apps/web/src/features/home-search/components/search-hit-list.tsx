import Link from "next/link";

import { EntityAvatar } from "../../entities/components/entity-avatar";
import { useTranslation } from "../../i18n/locale-provider";
import { formatEntityTypeLabel } from "../../i18n/entity-type-label";
import type { SearchEntityResult } from "../types/search-entities";

interface SearchHitListProps {
  query: string;
  results: SearchEntityResult[];
}

export function SearchHitList({ query, results }: SearchHitListProps) {
  const t = useTranslation();
  const [canonicalResult, ...otherResults] =
    results[0]?.resultKind === "canonical_site" ? results : [null, ...results];
  const regularResults = otherResults.filter(
    (entity): entity is SearchEntityResult => entity !== null
  );

  return (
    <div className="home-search-hit-list" aria-label={t("web.home.resultsAriaLabel")}>
      {canonicalResult ? (
        <>
          <CanonicalSearchHit entity={canonicalResult} query={query} />
          {regularResults.length > 0 ? <div className="home-search-hit-divider" role="separator" /> : null}
        </>
      ) : null}

      {regularResults.map((entity) => (
        <SearchHit entity={entity} key={entity.id} query={query} />
      ))}
    </div>
  );
}

interface SearchHitProps {
  entity: SearchEntityResult;
  query: string;
}

function SearchHit({ entity, query }: SearchHitProps) {
  const t = useTranslation();
  const subtitle = entity.description ?? entity.canonicalUrl ?? entity.slug;

  return (
    <Link
      className="home-search-hit"
      href={`/entities/${entity.id}?q=${encodeURIComponent(query)}`}
    >
      <EntityAvatar
        canonicalUrl={entity.canonicalUrl}
        entityId={entity.id}
        logoUrl={entity.logoUrl}
        size="sm"
        title={entity.title}
      />
      <span className="home-search-hit-content">
        <span className="home-search-hit-main">
          <span className="result-type">{formatEntityTypeLabel(t, entity.type)}</span>
          <span className="home-search-hit-title">{entity.title}</span>
        </span>
        {subtitle ? <span className="home-search-hit-url">{subtitle}</span> : null}
      </span>
    </Link>
  );
}

interface CanonicalSearchHitProps {
  entity: SearchEntityResult;
  query: string;
}

function CanonicalSearchHit({ entity, query }: CanonicalSearchHitProps) {
  const t = useTranslation();
  const hostname = formatSearchHostname(entity.canonicalUrl);

  return (
    <Link
      className="home-search-hit home-search-hit-canonical"
      href={`/entities/${entity.id}?q=${encodeURIComponent(query)}`}
    >
      <EntityAvatar
        canonicalUrl={entity.canonicalUrl}
        entityId={entity.id}
        logoUrl={entity.logoUrl}
        size="sm"
        title={entity.title}
      />
      <span className="home-search-hit-canonical-body">
        <span className="home-search-hit-badge">{t("search.canonical.badge")}</span>
        <span className="home-search-hit-main">
          <span className="home-search-hit-title">{entity.title}</span>
          {hostname ? <span className="home-search-hit-url">{hostname}</span> : null}
        </span>
        <span className="home-search-hit-rating">
        {entity.votesCount > 0 && entity.avgScore !== null ? (
          <>
            <span className="home-search-hit-rating-score" aria-hidden="true">
              ★
            </span>
            <span>{formatScore(entity.avgScore)}</span>
            <span className="home-search-hit-rating-meta">
              {t("search.canonical.ratings", { count: entity.votesCount })}
            </span>
          </>
        ) : (
          <span className="home-search-hit-rating-meta">{t("search.canonical.noRatings")}</span>
        )}
        </span>
      </span>
    </Link>
  );
}

function formatSearchHostname(canonicalUrl: string | null): string | null {
  if (!canonicalUrl) {
    return null;
  }

  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
}

function formatScore(score: number): string {
  return score.toFixed(1);
}
