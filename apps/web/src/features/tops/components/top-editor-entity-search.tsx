"use client";

import { useState } from "react";

import { apiRequest } from "../../../lib/api/api-client";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { createEntity } from "../../entity-creation/api/create-entity";
import { resolveEntityCreateError } from "../../entity-creation/lib/resolve-entity-create-error";
import type { Entity } from "../../entity-creation/types/entity";
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
  const shouldShowCreateHint =
    Boolean(searchData?.canCreateEntity) && showEmptyState && debouncedQuery.length > 0;

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

        {showEmptyState && !shouldShowCreateHint ? (
          <p className="muted-copy">{t("web.home.noResults", { query: debouncedQuery })}</p>
        ) : null}

        {shouldShowCreateHint ? (
          <CreateEntityAndAddHint
            query={searchData?.query ?? debouncedQuery}
            onAddEntity={(entity) => {
              onAddEntity(entity);
              setSearchQuery("");
            }}
          />
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

function CreateEntityAndAddHint({
  query,
  onAddEntity
}: {
  query: string;
  onAddEntity: (entity: TopItemEntity) => void;
}) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateAndAdd() {
    setErrorMessage(null);

    if (!authSession?.accessToken) {
      setErrorMessage(t("web.entityCreate.signInRequired"));
      return;
    }

    const title = query.trim();

    if (!title) {
      return;
    }

    setIsCreating(true);

    try {
      const entity = await createEntity(
        {
          title,
          type: "other"
        },
        authSession.accessToken
      );

      onAddEntity(mapCreatedEntityToTopItem(entity));
    } catch (error) {
      const resolvedError = resolveEntityCreateError(error, t);

      if (resolvedError.existingEntityId) {
        try {
          const existingEntity = await apiRequest<Entity>(`/entities/${resolvedError.existingEntityId}`);
          onAddEntity(mapCreatedEntityToTopItem(existingEntity));
          return;
        } catch {
          setErrorMessage(resolvedError.message);
          return;
        }
      }

      setErrorMessage(resolvedError.message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="home-search-callout ui-fade-soft">
      <p className="home-search-callout-title">{t("web.userTops.createEntityHint.title", { query })}</p>
      <p className="home-search-callout-copy">{t("web.userTops.createEntityHint.body")}</p>
      <button
        type="button"
        className="primary-button"
        disabled={isCreating}
        onClick={() => {
          void handleCreateAndAdd();
        }}
      >
        {isCreating ? t("web.userTops.createEntityHint.creating") : t("web.userTops.createEntityHint.action")}
      </button>
      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
    </div>
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
    logoUrl: entity.logoUrl,
    slug: entity.slug,
    title: entity.title,
    type: entity.type
  };
}

function mapCreatedEntityToTopItem(entity: Entity): TopItemEntity {
  return {
    canonicalUrl: entity.canonicalUrl,
    id: entity.id,
    logoUrl: null,
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
