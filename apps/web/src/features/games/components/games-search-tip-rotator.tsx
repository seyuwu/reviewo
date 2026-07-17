"use client";

import { DOTA_TEMP_PARTY_TTL_HOURS } from "@reviewo/shared";
import type { MessageKey } from "@reviewo/i18n";
import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./games-search-tip-rotator.module.css";

const TIP_IDS = [
  "party",
  "invite",
  "chat",
  "search",
  "roles",
  "officer"
] as const;
type TipId = (typeof TIP_IDS)[number];

const TIP_EYEBROW: Record<TipId, MessageKey> = {
  party: "games.search.tipRotator.partyEyebrow",
  invite: "games.search.tipRotator.inviteEyebrow",
  chat: "games.search.tipRotator.chatEyebrow",
  search: "games.search.tipRotator.searchEyebrow",
  roles: "games.launch.tip.rolesEyebrow",
  officer: "games.launch.tip.officerEyebrow"
};

const TIP_BODY: Record<TipId, MessageKey> = {
  party: "games.search.tipRotator.partyBody",
  invite: "games.search.tipRotator.inviteBody",
  chat: "games.search.tipRotator.chatBody",
  search: "games.search.tipRotator.searchBody",
  roles: "games.launch.tip.rolesBody",
  officer: "games.launch.tip.officerBody"
};

const ROTATE_MS = 5_500;
const FADE_MS = 400;

export function GamesSearchTipRotator() {
  const t = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);

    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused) {
      return;
    }

    let fadeTimeoutId: number | null = null;
    const intervalId = window.setInterval(() => {
      if (reduceMotion) {
        setIndex((current) => (current + 1) % TIP_IDS.length);
        return;
      }

      setVisible(false);
      fadeTimeoutId = window.setTimeout(() => {
        setIndex((current) => (current + 1) % TIP_IDS.length);
        setVisible(true);
        fadeTimeoutId = null;
      }, FADE_MS);
    }, ROTATE_MS);

    return () => {
      window.clearInterval(intervalId);

      if (fadeTimeoutId !== null) {
        window.clearTimeout(fadeTimeoutId);
      }
    };
  }, [paused, reduceMotion]);

  const tipId = TIP_IDS[index] ?? TIP_IDS[0];
  const bodyParams =
    tipId === "party" ? { hours: String(DOTA_TEMP_PARTY_TTL_HOURS) } : undefined;

  function goTo(nextIndex: number) {
    if (nextIndex === index) {
      return;
    }

    if (reduceMotion) {
      setIndex(nextIndex);
      return;
    }

    setVisible(false);
    window.setTimeout(() => {
      setIndex(nextIndex);
      setVisible(true);
    }, FADE_MS);
  }

  return (
    <aside
      aria-label={t("games.search.tipRotator.label")}
      className={styles.root}
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        aria-live="polite"
        className={`${styles.slide}${visible ? ` ${styles.slideVisible}` : ""}${
          reduceMotion ? ` ${styles.slideInstant}` : ""
        }`}
      >
        <p className={styles.eyebrow}>{t(TIP_EYEBROW[tipId])}</p>
        <p className={styles.body}>{t(TIP_BODY[tipId], bodyParams)}</p>
      </div>

      <div className={styles.dots} role="tablist" aria-label={t("games.search.tipRotator.label")}>
        {TIP_IDS.map((id, tipIndex) => (
          <button
            aria-label={t(TIP_EYEBROW[id])}
            aria-selected={tipIndex === index}
            className={`${styles.dot}${tipIndex === index ? ` ${styles.dotActive}` : ""}`}
            key={id}
            onClick={() => goTo(tipIndex)}
            role="tab"
            type="button"
          />
        ))}
      </div>
    </aside>
  );
}
