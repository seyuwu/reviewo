"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "../../../components/form-feedback";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchDotaProfileByAccountId } from "../api/dota-api";
import styles from "./dota-landing-view.module.css";

export function DotaLandingView() {
  const t = useTranslation();
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSearching(true);

    try {
      const profile = await fetchDotaProfileByAccountId(accountId.trim());
      router.push(`/dota/${profile.slug}`);
    } catch {
      setError(t("dota.landing.searchNotFound"));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className={styles.hero}>
      <p className={styles.eyebrow}>{t("dota.landing.eyebrow")}</p>
      <h1 className={styles.title}>{t("dota.landing.title")}</h1>
      <p className={styles.lead}>{t("dota.landing.lead")}</p>

      <div className={styles.actions}>
        <Link className="app-nav-cta" href="/dota/create">
          {t("dota.landing.createCta")}
        </Link>
      </div>

      <form className={styles.searchForm} onSubmit={handleSearch}>
        <label className={styles.searchLabel} htmlFor="dota-account-id-search">
          {t("dota.landing.searchLabel")}
        </label>
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            id="dota-account-id-search"
            inputMode="numeric"
            onChange={(event) => setAccountId(event.target.value)}
            pattern="[0-9]{8,10}"
            placeholder={t("dota.landing.searchPlaceholder")}
            value={accountId}
          />
          <button className="app-nav-cta" disabled={isSearching} type="submit">
            {isSearching ? t("dota.landing.searching") : t("dota.landing.searchCta")}
          </button>
        </div>
      </form>

      {error ? <FormFeedback errorMessage={error} /> : null}
    </section>
  );
}
