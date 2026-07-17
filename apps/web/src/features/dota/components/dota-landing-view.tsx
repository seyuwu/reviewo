"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "../../../components/form-feedback";
import { OpiniaIcon } from "../../../components/opinia-icon";
import {
  isGamesCommunityLive,
  useGamesLaunchStatus
} from "../../games/hooks/use-games-launch-status";
import { useTranslation } from "../../i18n/locale-provider";
import { searchDotaProfile } from "../api/dota-api";
import { useMyDotaProfileNav } from "../hooks/use-my-dota-profile-nav";
import { useDotaProfileSearch } from "../hooks/use-dota-profile-search";
import type { DotaProfileSearchHit } from "../types/dota-search";
import styles from "./dota-landing-view.module.css";

export function DotaLandingView() {
  const t = useTranslation();
  const router = useRouter();
  const myDotaProfile = useMyDotaProfileNav();
  const { status: launchStatus, isLoading: isLaunchStatusLoading } = useGamesLaunchStatus();
  // While loading, hide waitlist-gated CTAs (don't flash "waitlist mode" after go-live).
  const searchLive = !isLaunchStatusLoading && launchStatus.searchLive;
  const communityLive = !isLaunchStatusLoading && isGamesCommunityLive(launchStatus);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError: isSearchError,
    isFetching,
    isPending,
    trimmedQuery
  } = useDotaProfileSearch(query);

  const results = searchData?.results ?? [];
  const isSearchActive = trimmedQuery.length > 0;
  const isWaitingForResults =
    isSearchActive && (isDebouncing || isPending || (isFetching && results.length === 0));
  const showResults = isSearchActive && !isSearchError && results.length > 0;
  const showEmptyState =
    isSearchActive &&
    !isDebouncing &&
    !isPending &&
    !isFetching &&
    !isSearchError &&
    results.length === 0;

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedQuery.length < 1) {
      return;
    }

    if (results[0]) {
      router.push(`/dota/${results[0].slug}`);
      return;
    }

    setError(null);
    setIsSearching(true);

    try {
      const profile = await searchDotaProfile(trimmedQuery);
      router.push(`/dota/${profile.slug}`);
    } catch {
      setError(t("dota.landing.searchNotFound"));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{t("dota.landing.eyebrow")}</p>
        <h1 className={styles.title}>{t("dota.landing.title")}</h1>
        <p className={styles.lead}>{t("dota.landing.lead")}</p>

        <div className={styles.actions}>
          <Link
            aria-busy={myDotaProfile.isLoading}
            className="button-primary"
            href={myDotaProfile.href}
          >
            {myDotaProfile.isLoading
              ? t("common.loadingEllipsis")
              : myDotaProfile.hasProfile
                ? t("dota.landing.openProfileCta")
                : t("dota.landing.createCta")}
          </Link>
          <Link className="button-secondary" href={searchLive ? "/games" : "/games/search"}>
            {searchLive
              ? t("web.profile.dashboard.gameProfiles")
              : t("games.community.openSearch")}
          </Link>
          {communityLive ? (
            <Link className="button-secondary" href="/dota/teams/create">
              {t("dota.team.createCta")}
            </Link>
          ) : null}
        </div>

        <div className={styles.searchWrap}>
          <form className={styles.searchForm} onSubmit={handleSearch}>
            <label className={styles.searchLabel} htmlFor="dota-account-id-search">
              {t("dota.landing.searchLabel")}
            </label>
            <div className={styles.searchRow}>
              <input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className={styles.searchInput}
                id="dota-account-id-search"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setError(null);
                }}
                placeholder={t("dota.landing.searchPlaceholder")}
                spellCheck={false}
                value={query}
              />
              <button
                className="button-primary"
                disabled={isSearching || trimmedQuery.length < 1}
                type="submit"
              >
                {isSearching ? t("dota.landing.searching") : t("dota.landing.searchCta")}
              </button>
            </div>
          </form>

          {isSearchActive ? (
            <div
              aria-live="polite"
              className={`${styles.searchOutput}${isFetching ? ` ${styles.searchOutputFetching}` : ""}`}
            >
              {isWaitingForResults && !showResults ? (
                <p className={styles.searchStatus}>
                  <span aria-hidden="true" className="state-dot state-dot-loading" />
                  {t("web.home.searching")}
                </p>
              ) : null}

              {isSearchError ? (
                <p className={`${styles.searchStatus} ${styles.searchStatusError}`}>
                  {t("web.home.searchError")}
                </p>
              ) : null}

              {showResults ? (
                <div
                  aria-label={t("web.home.resultsAriaLabel")}
                  className={`home-search-hit-list ${styles.searchHitList}`}
                >
                  {results.map((hit) => (
                    <DotaSearchHit hit={hit} key={hit.entityId} />
                  ))}
                </div>
              ) : null}

              {showEmptyState ? (
                <p className={styles.searchStatus}>
                  {t("web.home.noResults", { query: debouncedQuery })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <FormFeedback errorMessage={error} /> : null}
      </div>
      <div className={styles.artwork} aria-hidden="true">
        <span className={styles.dotaMark}>D</span>
        <span className={styles.confirmBadge}>
          <OpiniaIcon name="sparkle" />
        </span>
      </div>
    </section>
  );
}

function DotaSearchHit({ hit }: { hit: DotaProfileSearchHit }) {
  const t = useTranslation();
  const subtitleParts = [
    hit.username ? `@${hit.username}` : null,
    hit.dotaAccountId ? `ID ${hit.dotaAccountId}` : null,
    hit.mmr ? `MMR ${hit.mmr}` : null
  ].filter(Boolean);

  return (
    <Link className="home-search-hit" href={`/dota/${hit.slug}`}>
      <span className={styles.searchHitAvatar} aria-hidden="true">
        {hit.title.slice(0, 1).toUpperCase()}
      </span>
      <span className="home-search-hit-content">
        <span className="home-search-hit-main">
          <span className="result-type">{t("dota.landing.searchHitType")}</span>
          <span className="home-search-hit-title">{hit.title}</span>
        </span>
        {subtitleParts.length > 0 ? (
          <span className="home-search-hit-url">{subtitleParts.join(" · ")}</span>
        ) : null}
      </span>
    </Link>
  );
}
