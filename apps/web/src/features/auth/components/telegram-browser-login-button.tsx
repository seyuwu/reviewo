"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import {
  createTelegramBrowserLogin,
  pollTelegramBrowserLogin,
  type TelegramBrowserLoginStart
} from "../api/telegram-login";
import type { AuthResponse } from "../types/auth";

interface TelegramBrowserLoginButtonProps {
  disabled?: boolean;
  onAuthSuccess: (response: AuthResponse) => void;
  onBusyChange: (busy: boolean) => void;
}

const POLL_INTERVAL_MS = 2500;
type TelegramLoginErrorKey = "auth.telegram.error.expired" | "auth.telegram.error.start";

export function TelegramBrowserLoginButton({
  disabled = false,
  onAuthSuccess,
  onBusyChange
}: TelegramBrowserLoginButtonProps) {
  const t = useTranslation();
  const [attempt, setAttempt] = useState<TelegramBrowserLoginStart | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [errorKey, setErrorKey] = useState<TelegramLoginErrorKey | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [showManualHelp, setShowManualHelp] = useState(false);
  const generation = useRef(0);
  const pollTimer = useRef<number | null>(null);
  const popup = useRef<Window | null>(null);
  const onAuthSuccessRef = useRef(onAuthSuccess);

  useEffect(() => {
    onAuthSuccessRef.current = onAuthSuccess;
  }, [onAuthSuccess]);

  useEffect(
    () => () => {
      generation.current += 1;
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
      popup.current?.close();
    },
    []
  );

  async function startLogin() {
    if (disabled || isPreparing || attempt) return;
    const currentGeneration = ++generation.current;
    setErrorKey(null);
    setConnectionIssue(false);
    setPopupBlocked(false);
    setShowManualHelp(false);
    setIsPreparing(true);
    onBusyChange(true);

    // Open the tab during the click gesture so popup blockers allow the Telegram deep link.
    const pendingPopup = window.open("about:blank", "_blank");
    if (pendingPopup) {
      pendingPopup.opener = null;
      popup.current = pendingPopup;
    }

    try {
      const created = await createTelegramBrowserLogin();
      if (generation.current !== currentGeneration) return;
      const botUrl = validateTelegramBotUrl(created.botUrl, created.requestId);
      const safeAttempt = { ...created, botUrl };
      setAttempt(safeAttempt);
      setPopupBlocked(!pendingPopup || pendingPopup.closed);
      setIsPreparing(false);

      if (pendingPopup && !pendingPopup.closed) {
        pendingPopup.location.replace(botUrl);
      }
      void pollUntilComplete(safeAttempt, currentGeneration);
    } catch {
      if (generation.current === currentGeneration) {
        pendingPopup?.close();
        popup.current = null;
        setIsPreparing(false);
        setErrorKey("auth.telegram.error.start");
        onBusyChange(false);
      }
    }
  }

  async function pollUntilComplete(created: TelegramBrowserLoginStart, currentGeneration: number) {
    if (generation.current !== currentGeneration) return;
    let retryAfterMs = POLL_INTERVAL_MS;
    try {
      const result = await pollTelegramBrowserLogin(created.requestId, created.pollToken);
      if (generation.current !== currentGeneration) return;
      if (result.status === "approved") {
        clearPollTimer();
        setAttempt(null);
        popup.current?.close();
        popup.current = null;
        onBusyChange(false);
        window.focus();
        onAuthSuccessRef.current(result.auth);
        return;
      }
      if (result.status === "expired") {
        popup.current?.close();
        setAttempt(null);
        popup.current = null;
        setErrorKey("auth.telegram.error.expired");
        onBusyChange(false);
        return;
      }
      setConnectionIssue(false);
    } catch {
      if (generation.current !== currentGeneration) return;
      setConnectionIssue(true);
      retryAfterMs = 5000;
    }

    pollTimer.current = window.setTimeout(
      () => void pollUntilComplete(created, currentGeneration),
      retryAfterMs
    );
  }

  function stopWaiting() {
    generation.current += 1;
    clearPollTimer();
    popup.current?.close();
    popup.current = null;
    setAttempt(null);
    setIsPreparing(false);
    setConnectionIssue(false);
    onBusyChange(false);
  }

  function clearPollTimer() {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  return (
    <div className="telegram-browser-login">
      <button
        type="button"
        className="telegram-browser-login__button"
        disabled={disabled || isPreparing || Boolean(attempt)}
        onClick={() => void startLogin()}
      >
        <TelegramPlaneIcon />
        <span>{isPreparing ? t("auth.telegram.preparing") : t("auth.telegram.button")}</span>
      </button>

      {!attempt && !isPreparing ? (
        <p className="telegram-browser-login__hint">{t("auth.telegram.hint")}</p>
      ) : null}

      {attempt ? (
        <div className="telegram-browser-login__pending" aria-live="polite">
          <p>{t("auth.telegram.confirmHint")}</p>
          <a
            className="telegram-browser-login__open"
            href={attempt.botUrl}
            rel="noreferrer"
            target="_blank"
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              const existingPopup = popup.current;
              if (existingPopup && !existingPopup.closed) {
                event.preventDefault();
                existingPopup.location.replace(attempt.botUrl);
                existingPopup.focus();
                return;
              }

              const openedPopup = window.open(attempt.botUrl, "_blank");
              if (openedPopup) {
                event.preventDefault();
                openedPopup.opener = null;
                popup.current = openedPopup;
                setPopupBlocked(false);
              }
            }}
          >
            {t("auth.telegram.openBot")}
          </a>
          <p className="telegram-browser-login__status">
            {connectionIssue ? t("auth.telegram.connectionIssue") : t("auth.telegram.waiting")}
          </p>
          <button
            type="button"
            className="telegram-browser-login__cancel"
            aria-expanded={showManualHelp}
            onClick={() => setShowManualHelp((visible) => !visible)}
          >
            {t("auth.telegram.manualHelpButton")}
          </button>
          {showManualHelp ? <p>{t("auth.telegram.manualHelp")}</p> : null}
          {popupBlocked ? (
            <p className="telegram-browser-login__status">{t("auth.telegram.popupBlocked")}</p>
          ) : null}
          <button type="button" className="telegram-browser-login__cancel" onClick={stopWaiting}>
            {t("auth.telegram.cancel")}
          </button>
        </div>
      ) : null}

      {errorKey ? (
        <p className="telegram-browser-login__error" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}

function validateTelegramBotUrl(value: string, requestId: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "t.me" ||
    !/^\/[A-Za-z0-9_]{5,32}$/.test(url.pathname) ||
    url.searchParams.get("start") !== `web_login_${requestId}`
  ) {
    throw new Error("Invalid Telegram bot login URL");
  }
  return url.toString();
}

function TelegramPlaneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.7 4.35 18.6 19c-.23 1.04-.84 1.3-1.7.81l-4.7-3.47-2.27 2.18c-.25.25-.46.46-.94.46l.34-4.78 8.7-7.86c.38-.34-.08-.53-.6-.19L6.68 13.02l-4.64-1.45c-1.01-.31-1.03-1.01.21-1.49L20.4 3.23c.84-.31 1.58.2 1.3 1.12Z" />
    </svg>
  );
}
