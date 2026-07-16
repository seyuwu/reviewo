"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import type { IntentMode } from "./games-search-onboarding-types";
import styles from "./games-search-onboarding.module.css";

export const GAMES_SEARCH_COACH_SEEN_KEY = "opinia.gamesSearchCoachSeen";

type CoachStep = "intent" | "controls" | "feed" | "rail";

interface SpotlightRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface GamesSearchOnboardingProps {
  controlsRef: RefObject<HTMLElement | null>;
  feedRef: RefObject<HTMLDivElement | null>;
  intentMode: IntentMode;
  onIntentPick: (mode: IntentMode) => void;
  open: boolean;
  railRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

function readSpotlight(el: HTMLElement | null): SpotlightRect | null {
  if (!el) {
    return null;
  }

  const rect = el.getBoundingClientRect();

  if (rect.width < 8 || rect.height < 8) {
    return null;
  }

  const pad = 8;

  return {
    height: rect.height + pad * 2,
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2
  };
}

export function GamesSearchOnboarding({
  controlsRef,
  feedRef,
  intentMode,
  onClose,
  onIntentPick,
  open,
  railRef
}: GamesSearchOnboardingProps) {
  const t = useTranslation();
  const [step, setStep] = useState<CoachStep>("intent");
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const finish = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GAMES_SEARCH_COACH_SEEN_KEY, "1");
    }

    onClose();
  }, [onClose]);

  const activeTarget =
    step === "controls" ? controlsRef : step === "feed" ? feedRef : step === "rail" ? railRef : null;

  const syncSpotlight = useCallback(() => {
    if (!open || !activeTarget) {
      setSpotlight(null);
      return;
    }

    setSpotlight(readSpotlight(activeTarget.current));
  }, [activeTarget, open]);

  useLayoutEffect(() => {
    syncSpotlight();

    if (step !== "intent" && activeTarget?.current) {
      activeTarget.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      window.setTimeout(syncSpotlight, 320);
    }
  }, [activeTarget, step, syncSpotlight]);

  useEffect(() => {
    if (!open || step === "intent") {
      return;
    }

    function handleResize() {
      syncSpotlight();
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    const intervalId = window.setInterval(syncSpotlight, 500);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      window.clearInterval(intervalId);
    };
  }, [open, step, syncSpotlight]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        finish();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [finish, open]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label={t("games.search.coach.title")}>
      {step === "intent" || !spotlight ? <div className={styles.dim} /> : null}

      {spotlight ? (
        <div
          className={styles.spotlight}
          style={{
            height: spotlight.height,
            left: spotlight.left,
            top: spotlight.top,
            width: spotlight.width
          }}
        />
      ) : null}

      {step === "intent" ? (
        <div className={styles.centerCard}>
          <p className={styles.eyebrow}>{t("games.search.coach.eyebrow")}</p>
          <h2 className={styles.title}>{t("games.search.coach.intentTitle")}</h2>
          <p className={styles.lead}>{t("games.search.coach.intentLead")}</p>
          <div className={styles.choiceRow}>
            <button
              className={styles.choice}
              onClick={() => {
                onIntentPick("recruit");
                setStep("controls");
              }}
              type="button"
            >
              <strong>{t("games.search.coach.choiceRecruit")}</strong>
              <span>{t("games.search.coach.choiceRecruitHint")}</span>
            </button>
            <button
              className={styles.choice}
              onClick={() => {
                onIntentPick("join");
                setStep("controls");
              }}
              type="button"
            >
              <strong>{t("games.search.coach.choiceJoin")}</strong>
              <span>{t("games.search.coach.choiceJoinHint")}</span>
            </button>
          </div>
          <button className={styles.skip} onClick={finish} type="button">
            {t("games.search.coach.skip")}
          </button>
        </div>
      ) : (
        <div
          className={`${styles.tipCard} ${
            step === "controls" ? styles.tipBesideLeft : step === "rail" ? styles.tipBesideRight : styles.tipCenter
          }`}
          style={
            spotlight
              ? step === "controls"
                ? { top: Math.max(12, spotlight.top), left: Math.min(window.innerWidth - 320, spotlight.left + spotlight.width + 16) }
                : step === "rail"
                  ? {
                      top: Math.max(12, spotlight.top),
                      left: Math.max(12, spotlight.left - 320)
                    }
                  : {
                      top: Math.min(window.innerHeight - 200, spotlight.top + spotlight.height + 16),
                      left: "50%",
                      transform: "translateX(-50%)"
                    }
              : undefined
          }
        >
          <p className={styles.eyebrow}>
            {step === "controls"
              ? t("games.search.coach.stepControlsEyebrow")
              : step === "feed"
                ? t("games.search.coach.stepFeedEyebrow")
                : t("games.search.coach.stepRailEyebrow")}
          </p>
          <p className={styles.tipBody}>
            {step === "controls"
              ? t("games.search.coach.stepControlsBody")
              : step === "feed"
                ? intentMode === "join"
                  ? t("games.search.coach.stepFeedJoin")
                  : t("games.search.coach.stepFeedRecruit")
                : t("games.search.coach.stepRailBody")}
          </p>
          <div className={styles.tipActions}>
            <button className={styles.skip} onClick={finish} type="button">
              {t("games.search.coach.skip")}
            </button>
            {step === "controls" ? (
              <button className="button-primary" onClick={() => setStep("feed")} type="button">
                {t("games.search.coach.next")}
              </button>
            ) : null}
            {step === "feed" ? (
              <button className="button-primary" onClick={() => setStep("rail")} type="button">
                {t("games.search.coach.next")}
              </button>
            ) : null}
            {step === "rail" ? (
              <button className="button-primary" onClick={finish} type="button">
                {t("games.search.coach.done")}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
