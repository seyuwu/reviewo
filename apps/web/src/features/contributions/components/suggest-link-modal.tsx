"use client";

import { useMemo, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import type { SearchEntityResult } from "../../home-search/types/search-entities";
import { SuggestCorrectionModal } from "./suggest-correction-modal";
import styles from "./entity-contributions-section.module.css";

interface SuggestLinkModalProps {
  currentEntityId: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (relatedEntityId: string) => void;
}

export function SuggestLinkModal({
  currentEntityId,
  isSubmitting,
  onClose,
  onSubmit
}: SuggestLinkModalProps) {
  const t = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<SearchEntityResult | null>(null);
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError,
    isFetching,
    isPending,
    trimmedQuery
  } = useEntitySearch(searchQuery);

  const results = useMemo(
    () => (searchData?.results ?? []).filter((entity) => entity.id !== currentEntityId),
    [currentEntityId, searchData?.results]
  );
  const isSearchActive = trimmedQuery.length > 0;
  const isWaitingForResults =
    isSearchActive && (isDebouncing || isPending || (isFetching && results.length === 0));
  const showResults = isSearchActive && !isError && results.length > 0;
  const showEmptyState =
    isSearchActive && !isDebouncing && !isPending && !isFetching && !isError && results.length === 0;

  return (
    <SuggestCorrectionModal
      fieldLabel={t("contributions.manualLinkModalHint")}
      isSubmitting={isSubmitting}
      submitDisabled={!selectedEntity}
      title={t("contributions.manualLinkModalTitle")}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();

        if (!selectedEntity) {
          return;
        }

        onSubmit(selectedEntity.id);
      }}
    >
      <label className="field-label">
        {t("contributions.manualLinkSearchLabel")}
        <input
          autoFocus
          autoComplete="off"
          maxLength={200}
          placeholder={t("contributions.manualLinkSearchPlaceholder")}
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setSelectedEntity(null);
          }}
        />
      </label>

      <div className={styles.manualMergeResults} aria-live="polite">
        {!isSearchActive ? (
          <p className="muted-copy">{t("contributions.manualLinkSearchEmpty")}</p>
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
            {results.map((entity) => {
              const isSelected = selectedEntity?.id === entity.id;

              return (
                <li key={entity.id}>
                  <button
                    type="button"
                    className={
                      isSelected
                        ? `home-search-hit ${styles.manualMergeHit} ${styles.manualMergeHitSelected}`
                        : `home-search-hit ${styles.manualMergeHit}`
                    }
                    onClick={() => {
                      setSelectedEntity(entity);
                    }}
                  >
                    <span className="home-search-hit-main">
                      <span className="home-search-hit-title">{entity.title}</span>
                      {entity.canonicalUrl ? (
                        <span className="home-search-hit-url">{formatHostname(entity.canonicalUrl)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </SuggestCorrectionModal>
  );
}

function formatHostname(canonicalUrl: string): string {
  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
}
