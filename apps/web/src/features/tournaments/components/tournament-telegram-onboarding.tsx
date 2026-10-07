"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { buildDotaBotProfileUrl } from "../../../lib/config/dota-bot";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createTelegramTournamentBotLink,
  getTelegramTournamentBotStatus,
  pollTelegramTournamentBotLink,
  type TelegramTournamentBotLinkRequest
} from "../api/telegram-bot-onboarding-api";
import styles from "./tournament-telegram-onboarding.module.css";

const SESSION_BOT_URL = `${buildDotaBotProfileUrl()}?start=web_session`;
const POLL_INTERVAL_MS = 2500;

type OnboardingError = "connect" | "conflict" | "expired" | "status";

export function TournamentTelegramButton() {
  const t = useTranslation();
  return (
    <a
      className={styles.serverButton}
      href={SESSION_BOT_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <TelegramIcon />
      {t("dota.tournaments.telegram.button")}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function TournamentTelegramOnboarding({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const generation = useRef(0);
  const pollTimer = useRef<number | null>(null);
  const popup = useRef<Window | null>(null);
  const [accountState, setAccountState] = useState<"loading" | "linked" | "needs-link" | "guest" | "error">("loading");
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Extract<TelegramTournamentBotLinkRequest, { botStarted: false }> | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<OnboardingError | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    if (!isAuthSessionLoaded) return;
    const currentGeneration = ++generation.current;
    setVerifiedUserId(null);
    if (!authSession) {
      setAccountState("guest");
      setChallenge(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setAccountState("loading");
    void getTelegramTournamentBotStatus(authSession.accessToken)
      .then(({ botStarted }) => {
        if (cancelled || generation.current !== currentGeneration) return;
        setVerifiedUserId(authSession.userId);
        setAccountState(botStarted ? "linked" : "needs-link");
      })
      .catch(() => {
        if (cancelled || generation.current !== currentGeneration) return;
        setAccountState("error");
        setError("status");
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, authSession?.userId, isAuthSessionLoaded]);

  useEffect(
    () => () => {
      generation.current += 1;
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
      popup.current?.close();
    },
    []
  );

  async function startLink() {
    if (!authSession) {
      window.location.assign(`/profile?next=${encodeURIComponent("/games/tournaments")}`);
      return;
    }
    if (isPreparing || challenge) return;
    const currentGeneration = ++generation.current;
    setError(null);
    setConnectionIssue(false);
    setPopupBlocked(false);
    setIsPreparing(true);
    const pendingPopup = window.open("about:blank", "_blank");
    if (pendingPopup) {
      pendingPopup.opener = null;
      popup.current = pendingPopup;
    }

    try {
      const response = await createTelegramTournamentBotLink(authSession.accessToken);
      if (generation.current !== currentGeneration) return;
      if (response.botStarted) {
        if (pendingPopup && !pendingPopup.closed) pendingPopup.location.replace(SESSION_BOT_URL);
        popup.current = null;
        setPopupBlocked(!pendingPopup || pendingPopup.closed);
        setVerifiedUserId(authSession.userId);
        setAccountState("linked");
        return;
      }
      const botUrl = validateBotLinkUrl(response.botUrl, response.requestId);
      const nextChallenge = { ...response, botUrl };
      setChallenge(nextChallenge);
      setPopupBlocked(!pendingPopup || pendingPopup.closed);
      if (pendingPopup && !pendingPopup.closed) pendingPopup.location.replace(botUrl);
      void pollLink(authSession.accessToken, response.requestId, currentGeneration);
    } catch {
      if (generation.current === currentGeneration) setError("connect");
      pendingPopup?.close();
      popup.current = null;
    } finally {
      if (generation.current === currentGeneration) setIsPreparing(false);
    }
  }

  async function pollLink(accessToken: string, requestId: string, currentGeneration: number) {
    if (generation.current !== currentGeneration) return;
    let retryAfter = POLL_INTERVAL_MS;
    try {
      const result = await pollTelegramTournamentBotLink(accessToken, requestId);
      if (generation.current !== currentGeneration) return;
      if (result.status === "approved") {
        popup.current = null;
        setChallenge(null);
        setVerifiedUserId(authSession?.userId ?? null);
        setAccountState("linked");
        return;
      }
      if (result.status === "conflict") {
        setChallenge(null);
        setError("conflict");
        popup.current?.close();
        popup.current = null;
        return;
      }
      if (result.status === "expired") {
        setChallenge(null);
        setError("expired");
        popup.current?.close();
        popup.current = null;
        return;
      }
      setConnectionIssue(false);
    } catch {
      if (generation.current !== currentGeneration) return;
      setConnectionIssue(true);
      retryAfter = 5000;
    }

    pollTimer.current = window.setTimeout(
      () => void pollLink(accessToken, requestId, currentGeneration),
      retryAfter
    );
  }

  function retryStatus() {
    if (!authSession) return;
    setError(null);
    setVerifiedUserId(null);
    setAccountState("loading");
    void getTelegramTournamentBotStatus(authSession.accessToken)
      .then(({ botStarted }) => {
        setVerifiedUserId(authSession.userId);
        setAccountState(botStarted ? "linked" : "needs-link");
      })
      .catch(() => {
        setError("status");
        setAccountState("error");
      });
  }

  const busy = isPreparing || Boolean(challenge);

  if (isAuthSessionLoaded && authSession && accountState === "linked" && verifiedUserId === authSession.userId) {
    return children;
  }

  return (
    <main className={styles.gate}>
      <div className={styles.content}>
        <div className={styles.logo}><TelegramIcon /></div>
        <h2 id="tournament-telegram-title">
          {accountState === "guest" || !isAuthSessionLoaded
            ? t("dota.tournaments.telegram.loginTitle")
            : t("dota.tournaments.telegram.title")}
        </h2>
        <p id="tournament-telegram-description">
          {accountState === "guest" || !isAuthSessionLoaded
            ? t("dota.tournaments.telegram.loginDescription")
            : t("dota.tournaments.telegram.description")}
        </p>

        {accountState === "loading" ? (
          <p className={styles.status} aria-live="polite">{t("dota.tournaments.telegram.checking")}</p>
        ) : null}

        {challenge ? (
          <div className={styles.challenge} aria-live="polite">
            <p>{t("dota.tournaments.telegram.codeHint")}</p>
            <output aria-label={t("dota.tournaments.telegram.codeLabel")}>{challenge.verificationCode}</output>
            <a className={styles.joinButton} href={challenge.botUrl} rel="noreferrer" target="_blank">
              <TelegramIcon />{t("dota.tournaments.telegram.openBot")}<span aria-hidden="true">↗</span>
            </a>
            <p>{connectionIssue ? t("dota.tournaments.telegram.connectionIssue") : t("dota.tournaments.telegram.waiting")}</p>
            {popupBlocked ? <p>{t("dota.tournaments.telegram.popupBlocked")}</p> : null}
          </div>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">{t(`dota.tournaments.telegram.error.${error}` as `dota.tournaments.telegram.error.${OnboardingError}`)}</p>
        ) : null}

        {accountState === "error" && !challenge ? (
          <div className={styles.actions}>
            <button className={styles.joinButton} type="button" onClick={retryStatus}>{t("dota.tournaments.telegram.retry")}</button>
          </div>
        ) : accountState === "guest" ? (
          <div className={styles.actions}>
            <button className={styles.joinButton} type="button" onClick={() => void startLink()}>{t("dota.tournaments.telegram.login")}</button>
          </div>
        ) : accountState !== "loading" && !challenge ? (
          <div className={styles.actions}>
            <button className={styles.joinButton} type="button" disabled={busy} onClick={() => void startLink()}>
              <TelegramIcon />{isPreparing ? t("dota.tournaments.telegram.preparing") : t("dota.tournaments.telegram.connect")}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function validateBotLinkUrl(value: string, requestId: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "t.me" ||
    !/^\/[A-Za-z0-9_]{5,32}$/.test(url.pathname) ||
    url.searchParams.get("start") !== `tournament_link_${requestId}`
  ) {
    throw new Error("Invalid Telegram bot link URL");
  }
  return url.toString();
}

function TelegramIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.7 4.35 18.6 19c-.23 1.04-.84 1.3-1.7.81l-4.7-3.47-2.27 2.18c-.25.25-.46.46-.94.46l.34-4.78 8.7-7.86c.38-.34-.08-.53-.6-.19L6.68 13.02l-4.64-1.45c-1.01-.31-1.03-1.01.21-1.49L20.4 3.23c.84-.31 1.58.2 1.3 1.12Z" />
  </svg>;
}
