"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { checkUrlTrust } from "../api/trust-check";
import { EntitySearchResultsPanel } from "./entity-search-results-panel";
import { useEntitySearch } from "../hooks/use-entity-search";

export function SearchPageView() {
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

  const isSearchActive = trimmedQuery.length > 0;

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
      <section className="home-hub-card search-page-card" aria-labelledby="search-page-heading">
        <header className="home-hub-header">
          <h1 id="search-page-heading">{t("web.searchPage.title")}</h1>
          <p className="home-hub-subtitle">{t("web.searchPage.subtitle")}</p>
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
            <EntitySearchResultsPanel
              debouncedQuery={debouncedQuery}
              isDebouncing={isDebouncing}
              isError={isError}
              isFetching={isFetching}
              isPending={isPending}
              searchData={searchData}
              trimmedQuery={trimmedQuery}
            />
          ) : null}
        </div>

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
