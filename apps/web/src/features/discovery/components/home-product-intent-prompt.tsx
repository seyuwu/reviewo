"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getDotaHomeUrl, getGamesHomeUrl } from "../../../lib/config/product-hosts";
import { useTranslation } from "../../i18n/locale-provider";
import styles from "./home-product-intent-prompt.module.css";

const SEEN_KEY = "opinia.homeProductIntentSeen";
const SHOW_DELAY_MS = 1_400;

export function HomeProductIntentPrompt() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [gamesHref, setGamesHref] = useState("/games/search");
  const [dotaHref, setDotaHref] = useState("/games/search");

  useEffect(() => {
    setGamesHref(getGamesHomeUrl());
    setDotaHref(getDotaHomeUrl());

    if (typeof window === "undefined") {
      return;
    }

    if (window.localStorage.getItem(SEEN_KEY) === "1") {
      return;
    }

    const timerId = window.setTimeout(() => {
      setOpen(true);
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SEEN_KEY, "1");
    }

    setOpen(false);
  }

  if (!open) {
    return null;
  }

  return (
    <div className={styles.root} role="dialog" aria-labelledby="home-product-intent-title" aria-modal="false">
      <div className={styles.card}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t("web.homeIntent.eyebrow")}</p>
          <h2 className={styles.title} id="home-product-intent-title">
            {t("web.homeIntent.title")}
          </h2>
          <p className={styles.lead}>{t("web.homeIntent.lead")}</p>
        </div>

        <div className={styles.actions}>
          <Link className={styles.gamesCta} href={gamesHref} onClick={dismiss}>
            <strong>{t("web.homeIntent.gamesCta")}</strong>
            <span>{t("web.homeIntent.gamesHint")}</span>
          </Link>
          <Link className={styles.dotaCta} href={dotaHref} onClick={dismiss}>
            <strong>{t("web.homeIntent.dotaCta")}</strong>
            <span>{t("web.homeIntent.dotaHint")}</span>
          </Link>
          <button className={styles.stayCta} onClick={dismiss} type="button">
            <strong>{t("web.homeIntent.stayCta")}</strong>
            <span>{t("web.homeIntent.stayHint")}</span>
          </button>
        </div>

        <button
          aria-label={t("common.close")}
          className={styles.close}
          onClick={dismiss}
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
}
