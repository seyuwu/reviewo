"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";

import { TrendingNowPanel } from "../../growth/components/trending-now-panel";
import { useTranslation } from "../../i18n/locale-provider";
import { formatEntityTypeLabel } from "../../i18n/entity-type-label";
import { checkUrlTrust } from "../api/trust-check";
import { useEntitySearch } from "../hooks/use-entity-search";
import type { SearchEntityResult } from "../types/search-entities";

export function HomeSearch() {
  const t = useTranslation();
  const inputId = useId();
  const trustCheckInputId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [trustCheckUrl, setTrustCheckUrl] = useState("");
  const [trustCheckError, setTrustCheckError] = useState<string | null>(null);
  const [isCheckingTrust, setIsCheckingTrust] = useState(false);
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError,
    isFetching,
    isPending,
    trimmedQuery
  } = useEntitySearch(query);

  useEffect(() => {
    setQuery(searchParams.get("q")?.trim() ?? "");
  }, [searchParams]);

  const results = searchData?.results ?? [];
  const isSearchActive = trimmedQuery.length > 0;
  const isWaitingForResults =
    isSearchActive && (isDebouncing || isPending || (isFetching && results.length === 0));
  const showResults = isSearchActive && !isError && results.length > 0;
  const showEmptyState =
    isSearchActive &&
    !isDebouncing &&
    !isPending &&
    !isFetching &&
    !isError &&
    results.length === 0;
  const shouldShowCreateHint =
    Boolean(searchData?.canCreateEntity) && showEmptyState && debouncedQuery.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  async function handleTrustCheckSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = trustCheckUrl.trim();

    if (!trimmedUrl) {
      setTrustCheckError(t("web.home.trustCheck.emptyError"));
      return;
    }

    setTrustCheckError(null);
    setIsCheckingTrust(true);

    try {
      const result = await checkUrlTrust(trimmedUrl);
      router.push(
        `/entities/${result.entity.id}?checked=${encodeURIComponent(result.url.canonical)}`
      );
    } catch {
      setTrustCheckError(t("web.home.trustCheck.error"));
    } finally {
      setIsCheckingTrust(false);
    }
  }

  return (
    <div className="home-hub">
      <section className="home-hub-card" aria-labelledby="home-hub-heading">
        <header className="home-hub-header">
          <h1 id="home-hub-heading">{t("web.home.title")}</h1>
          <p className="home-hub-subtitle">{t("web.home.subtitle")}</p>
        </header>

        <div className="home-hub-panel">
          <p className="home-hub-panel-copy">{t("web.home.searchBlockHint")}</p>

          <form
            className="search-form home-hub-form home-hub-input-row"
            role="search"
            onSubmit={handleSubmit}
          >
            <label className="sr-only" htmlFor={inputId}>
              {t("web.home.searchLabel")}
            </label>
            <input
              id={inputId}
              autoComplete="off"
              maxLength={200}
              placeholder={t("web.home.searchPlaceholder")}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
            <button type="submit" disabled={!trimmedQuery}>
              {t("common.search")}
            </button>
          </form>

          {isSearchActive ? (
            <div
              className={`home-hub-search-output${isFetching ? " home-hub-search-output-fetching" : ""}`}
              aria-live="polite"
            >
              {isWaitingForResults && !showResults ? (
                <p className="home-hub-search-status">
                  <span className="state-dot state-dot-loading" aria-hidden="true" />
                  {t("web.home.searching")}
                </p>
              ) : null}

              {isError ? (
                <p className="home-hub-search-status home-hub-search-status-error">
                  {t("web.home.searchError")}
                </p>
              ) : null}

              {showResults ? (
                <SearchHitList query={debouncedQuery || trimmedQuery} results={results} />
              ) : null}

              {showEmptyState && !shouldShowCreateHint ? (
                <p className="home-hub-search-status">
                  {t("web.home.noResults", { query: debouncedQuery })}
                </p>
              ) : null}

              {shouldShowCreateHint ? (
                <CreateEntityHint query={searchData?.query ?? debouncedQuery} />
              ) : null}
            </div>
          ) : null}
        </div>

        <TrendingNowPanel />

        <section className="home-hub-secondary panel-card">
          <div className="section-heading">
            <p className="result-type">{t("web.home.trustCheck.title")}</p>
            <h2>{t("web.home.trustCheck.subtitle")}</h2>
          </div>

          <form className="trust-check-form home-hub-form" onSubmit={handleTrustCheckSubmit}>
            <label className="sr-only" htmlFor={trustCheckInputId}>
              {t("web.home.trustCheck.fieldLabel")}
            </label>
            <div className="search-form home-hub-input-row">
              <input
                id={trustCheckInputId}
                autoComplete="off"
                maxLength={2048}
                placeholder={t("web.home.trustCheck.placeholder")}
                type="text"
                value={trustCheckUrl}
                onChange={(event) => {
                  setTrustCheckUrl(event.target.value);
                }}
              />
              <button type="submit" disabled={!trustCheckUrl.trim() || isCheckingTrust}>
                {isCheckingTrust
                  ? t("web.home.trustCheck.checking")
                  : t("web.home.trustCheck.action")}
              </button>
            </div>
            {trustCheckError ? (
              <p className="error-message trust-check-error">{trustCheckError}</p>
            ) : null}
          </form>
        </section>
      </section>
    </div>
  );
}

interface SearchHitListProps {
  query: string;
  results: SearchEntityResult[];
}

function SearchHitList({ query, results }: SearchHitListProps) {
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
      <span className="home-search-hit-main">
        <span className="result-type">{formatEntityTypeLabel(t, entity.type)}</span>
        <span className="home-search-hit-title">{entity.title}</span>
      </span>
      {subtitle ? <span className="home-search-hit-url">{subtitle}</span> : null}
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

interface CreateEntityHintProps {
  query: string;
}

function CreateEntityHint({ query }: CreateEntityHintProps) {
  const t = useTranslation();
  const createEntityHref = `/entities/new?query=${encodeURIComponent(query)}`;

  return (
    <div className="home-search-callout ui-fade-soft">
      <p className="home-search-callout-title">{t("web.home.createHint.title", { query })}</p>
      <p className="home-search-callout-copy">{t("web.home.createHint.body")}</p>
      <Link className="primary-link" href={createEntityHref}>
        {t("web.home.createHint.action")}
      </Link>
    </div>
  );
}
