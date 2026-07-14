"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { EntitySearchResultsPanel } from "../../home-search/components/entity-search-results-panel";
import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import { useTranslation } from "../../i18n/locale-provider";

export function CompactSearchBar({ variant = "default" }: { variant?: "default" | "hero" }) {
  const t = useTranslation();
  const router = useRouter();
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

    if (!trimmedQuery) {
      return;
    }

    router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
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
    <div
      className={
        variant === "hero"
          ? "discovery-compact-search-wrap discovery-compact-search-wrap--hero"
          : "discovery-compact-search-wrap"
      }
      id="home-search"
    >
      <form className="discovery-compact-search" role="search" onSubmit={handleSubmit}>
        {variant === "hero" ? (
          <svg
            aria-hidden="true"
            className="discovery-compact-search-icon"
            fill="none"
            viewBox="0 0 20 20"
          >
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.75" />
            <path d="M13 13l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
          </svg>
        ) : null}
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
