"use client";

import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import type { SearchEntityResult } from "../../home-search/types/search-entities";
import type { TopItemEntity } from "../types/tops";

interface TopEditorEntitySearchProps {
  addedEntityIds: Set<string>;
  onAddEntity: (entity: TopItemEntity) => void;
}

export function TopEditorEntitySearch({ addedEntityIds, onAddEntity }: TopEditorEntitySearchProps) {
  const t = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError,
    isFetching,
    isPending,
    trimmedQuery
  } = useEntitySearch(searchQuery);

  const results = searchData?.results ?? [];
  const isSearchActive = trimmedQuery.length > 0;
  const isWaitingForResults =
    isSearchActive && (isDebouncing || isPending || (isFetching && results.length === 0));
  const showResults = isSearchActive && !isError && results.length > 0;
  const showEmptyState =
    isSearchActive && !isDebouncing && !isPending && !isFetching && !isError && results.length === 0;

  return (
    <aside className="top-editor-search-panel panel-card" aria-labelledby="top-editor-search-heading">
      <div className="top-editor-search-header">
        <p className="result-type" id="top-editor-search-heading">
          {t("web.userTops.searchEntities")}
        </p>
        <p className="muted-copy">{t("web.userTops.searchSidebarHint")}</p>
      </div>

      <label className="field">
        <span className="sr-only">{t("web.userTops.searchPlaceholder")}</span>
        <input
          type="search"
          autoComplete="off"
          maxLength={200}
          placeholder={t("web.userTops.searchPlaceholder")}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
          }}
        />
      </label>

      <div className="top-editor-search-results" aria-live="polite">
        {!isSearchActive ? (
          <p className="muted-copy">{t("web.userTops.searchEmptyHint")}</p>
        ) : null}

        {isWaitingForResults ? (
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

        {showEmptyState ? (
          <p className="muted-copy">{t("web.home.noResults", { query: debouncedQuery })}</p>
        ) : null}

        {showResults ? (
          <ul className="home-search-hit-list">
            {results.map((entity) => (
              <li key={entity.id}>
                <EntitySearchHit
                  entity={entity}
                  isAdded={addedEntityIds.has(entity.id)}
                  onAdd={() => {
                    onAddEntity(mapSearchResultToEntity(entity));
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

function EntitySearchHit({
  entity,
  isAdded,
  onAdd
}: {
  entity: SearchEntityResult;
  isAdded: boolean;
  onAdd: () => void;
}) {
  const t = useTranslation();

  return (
    <button
      type="button"
      className={
        isAdded ? "home-search-hit top-editor-search-hit is-added" : "home-search-hit top-editor-search-hit"
      }
      disabled={isAdded}
      onClick={onAdd}
    >
      <span className="home-search-hit-main">
        <span className="home-search-hit-title">{entity.title}</span>
        {entity.canonicalUrl ? (
          <span className="home-search-hit-url">{formatHostname(entity.canonicalUrl)}</span>
        ) : null}
      </span>
      <span className="top-editor-search-hit-action">
        {isAdded ? t("web.userTops.entityAlreadyInTop") : t("web.userTops.entityAddAction")}
      </span>
    </button>
  );
}

function mapSearchResultToEntity(entity: SearchEntityResult): TopItemEntity {
  return {
    canonicalUrl: entity.canonicalUrl,
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    type: entity.type
  };
}

function formatHostname(canonicalUrl: string): string {
  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
}
