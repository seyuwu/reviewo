"use client";

import { buildCompareSlug } from "@reviewo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import type { SearchEntityResult } from "../../home-search/types/search-entities";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchActiveNow } from "../api/active-now";
import type { ActiveNowItem } from "../types/growth";
import styles from "./entity-compare-chips.module.css";

interface EntityCompareChipsProps {
  entityId: string;
  entitySlug: string;
}

export function EntityCompareChips({ entityId, entitySlug }: EntityCompareChipsProps) {
  const t = useTranslation();
  const [targets, setTargets] = useState<ActiveNowItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchActiveNow(8)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setTargets(response.items.filter((item) => item.entityId !== entityId && item.entitySlug));
      })
      .catch(() => {
        if (!cancelled) {
          setTargets([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSuggestions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return (
    <div className={styles.wrap}>
      <div className="section-heading">
        <p className="result-type">{t("growth.panel.compareEyebrow")}</p>
        <h2>{t("growth.panel.compareTitle")}</h2>
      </div>

      <p className={`muted-copy ${styles.hint}`}>{t("growth.panel.compareHint")}</p>

      <CompareEntitySearch currentEntityId={entityId} entitySlug={entitySlug} />

      {isLoadingSuggestions ? (
        <p className={`muted-copy ${styles.suggestionsStatus}`}>{t("chat.loading")}</p>
      ) : targets.length > 0 ? (
        <div className={styles.suggestions}>
          <span className={styles.label}>{t("growth.hero.compareWith")}</span>
          <div className={styles.chips}>
            {targets.slice(0, 6).map((target) => (
              <Link
                className={styles.chip}
                href={buildComparePath(entitySlug, target.entitySlug)}
                key={target.entityId}
              >
                {target.entityTitle}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className={`muted-copy ${styles.suggestionsStatus}`}>{t("growth.panel.noSuggestions")}</p>
      )}
    </div>
  );
}

function buildComparePath(leftSlug: string, rightSlug: string): string {
  return `/compare/${buildCompareSlug(leftSlug, rightSlug)}`;
}

function CompareEntitySearch({
  currentEntityId,
  entitySlug
}: {
  currentEntityId: string;
  entitySlug: string;
}) {
  const t = useTranslation();
  const inputId = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError,
    isFetching,
    isPending,
    trimmedQuery
  } = useEntitySearch(query);

  const results = (searchData?.results ?? []).filter((result) => result.id !== currentEntityId);
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

  function handleSelect(result: SearchEntityResult): void {
    setQuery("");
    router.push(buildComparePath(entitySlug, result.slug));
  }

  return (
    <div className={styles.search}>
      <form
        className={`search-form ${styles.searchForm}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          {t("web.home.searchLabel")}
        </label>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          maxLength={200}
          placeholder={t("web.home.searchPlaceholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </form>

      {isSearchActive ? (
        <div className={styles.searchOutput} aria-live="polite">
          {isWaitingForResults && !showResults ? (
            <p className={`home-hub-search-status ${styles.searchStatus}`}>
              <span className="state-dot state-dot-loading" aria-hidden="true" />
              {t("web.home.searching")}
            </p>
          ) : null}

          {isError ? (
            <p className={`home-hub-search-status home-hub-search-status-error ${styles.searchStatus}`}>
              {t("web.home.searchError")}
            </p>
          ) : null}

          {showResults ? (
            <ul className={`home-search-hit-list ${styles.searchResults}`}>
              {results.slice(0, 6).map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className={`home-search-hit ${styles.searchHitButton}`}
                    onClick={() => {
                      handleSelect(result);
                    }}
                  >
                    <span className="home-search-hit-main">
                      <span className="home-search-hit-title">{result.title}</span>
                      {result.canonicalUrl ? (
                        <span className="home-search-hit-url">{formatHostname(result.canonicalUrl)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {showEmptyState ? (
            <p className={`home-hub-search-status ${styles.searchStatus}`}>
              {t("web.home.noResults", { query: debouncedQuery })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatHostname(canonicalUrl: string): string {
  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
}
