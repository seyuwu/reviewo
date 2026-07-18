"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./games-search-onboarding.module.css";

export const GAMES_SEARCH_COACH_SEEN_KEY = "opinia.gamesSearchCoachSeen.v2";

interface CoachPosition {
  left: number;
  side: "below" | "left" | "right";
  top: number;
}

interface GamesSearchOnboardingProps {
  onClose: () => void;
  open: boolean;
  targetRef: RefObject<HTMLDivElement | null>;
}

export function gamesSearchCoachSeenKey(userId: string): string {
  return `${GAMES_SEARCH_COACH_SEEN_KEY}:${userId}`;
}

export function GamesSearchOnboarding({
  onClose,
  open,
  targetRef
}: GamesSearchOnboardingProps) {
  const t = useTranslation();
  const [position, setPosition] = useState<CoachPosition | null>(null);

  const syncPosition = useCallback(() => {
    const target = targetRef.current;
    if (!open || !target) {
      setPosition(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const cardWidth = Math.min(286, window.innerWidth - 24);
    const gap = 14;

    if (rect.right + gap + cardWidth <= window.innerWidth - 12) {
      setPosition({
        left: rect.right + gap,
        side: "right",
        top: Math.max(12, rect.top + 8)
      });
      return;
    }

    if (rect.left - gap - cardWidth >= 12) {
      setPosition({
        left: rect.left - gap - cardWidth,
        side: "left",
        top: Math.max(12, rect.top + 8)
      });
      return;
    }

    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - cardWidth - 12)),
      side: "below",
      top: Math.min(window.innerHeight - 170, rect.bottom + gap)
    });
  }, [open, targetRef]);

  useLayoutEffect(() => {
    syncPosition();
  }, [syncPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [open, syncPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !position) {
    return null;
  }

  const sideClass =
    position.side === "right"
      ? styles.cardRight
      : position.side === "left"
        ? styles.cardLeft
        : styles.cardBelow;

  return (
    <div className={styles.root}>
      <aside
        aria-label={t("games.search.coach.title")}
        className={`${styles.card} ${sideClass}`}
        role="dialog"
        style={{ left: position.left, top: position.top }}
      >
        <button
          aria-label={t("common.close")}
          className={styles.close}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <p className={styles.eyebrow}>{t("games.search.coach.quickStart")}</p>
        <h2 className={styles.title}>{t("games.search.coach.intentTitle")}</h2>
        <p className={styles.lead}>{t("games.search.coach.intentQuickLead")}</p>
        <button className={styles.done} onClick={onClose} type="button">
          {t("games.search.coach.done")}
        </button>
      </aside>
    </div>
  );
}
