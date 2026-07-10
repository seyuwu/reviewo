"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { EntitySearchResultsPanel } from "../../home-search/components/entity-search-results-panel";
import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import { useTranslation } from "../../i18n/locale-provider";

export function CompactSearchBar() {
  const t = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  useEffect(() => {
    function focusSearchInput() {
      inputRef.current?.focus({ preventScroll: true });
    }

    focusSearchInput();

    function handleHashChange() {
      focusSearchInput();

      if (window.location.hash === "#home-search") {
        document.getElementById("home-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <div className="discovery-compact-search-wrap" id="home-search">
      <form className="discovery-compact-search" role="search" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          {t("web.homeFeed.compactSearchLabel")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          autoComplete="off"
          maxLength={200}
          placeholder={t("web.homeFeed.compactSearchPlaceholder")}
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

      <EntitySearchResultsPanel
        debouncedQuery={debouncedQuery}
        isDebouncing={isDebouncing}
        isError={isError}
        isFetching={isFetching}
        isPending={isPending}
        searchData={searchData}
        trimmedQuery={trimmedQuery}
      />
    </div>
  );
}
