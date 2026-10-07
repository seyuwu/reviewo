"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api/api-error";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createTelegramOfficialRequest,
  completeTelegramOfficialLink,
  completeTelegramOfficialLogin,
  type TelegramOfficialRequest
} from "../api/telegram-official-login";
import {
  loadTelegramOfficialSdk,
  releaseTelegramPopup,
  reserveTelegramPopup
} from "../lib/telegram-official-sdk";
import type { AuthResponse } from "../types/auth";

type Props = {
  disabled?: boolean;
  buttonClassName?: string;
  onBusyChange?: (busy: boolean) => void;
} & (
  | { intent: "login"; onSuccess: (auth: AuthResponse) => void }
  | { intent: "link"; accessToken: string; onSuccess: () => void }
);

type ErrorKey =
  | "auth.telegram.official.error.start"
  | "auth.telegram.official.error.invalid"
  | "auth.telegram.official.error.conflict"
  | "auth.telegram.official.error.notLinked"
  | "auth.telegram.official.error.botAccess"
  | "auth.telegram.official.error.popup";

export function TelegramOfficialButton(props: Props) {
  const t = useTranslation();
  const [request, setRequest] = useState<TelegramOfficialRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const generation = useRef(0);
  const popupOwner = useRef(Symbol("telegram-login-popup"));
  const expiryTimer = useRef<number | null>(null);
  const sdk = useRef<Awaited<ReturnType<typeof loadTelegramOfficialSdk>> | null>(null);
  const currentProps = useRef(props);
  currentProps.current = props;
  const accessToken = props.intent === "link" ? props.accessToken : undefined;

  function setWaiting(value: boolean) {
    setBusy(value);
    currentProps.current.onBusyChange?.(value);
  }

  async function prepare() {
    const currentGeneration = ++generation.current;
    setRequest(null);
    setError(null);
    if (expiryTimer.current !== null) window.clearTimeout(expiryTimer.current);
    try {
      const [nextRequest, nextSdk] = await Promise.all([
        createTelegramOfficialRequest(accessToken),
        loadTelegramOfficialSdk()
      ]);
      if (generation.current !== currentGeneration) return;
      sdk.current = nextSdk;
      setRequest(nextRequest);
      expiryTimer.current = window.setTimeout(() => {
        if (generation.current !== currentGeneration) return;
        generation.current += 1;
        releaseTelegramPopup(popupOwner.current, true);
        setWaiting(false);
        setRequest(null);
        setError("auth.telegram.official.error.invalid");
      }, nextRequest.expiresIn * 1000);
    } catch {
      if (generation.current === currentGeneration) setError("auth.telegram.official.error.start");
    }
  }

  useEffect(() => {
    void prepare();
    return () => {
      generation.current += 1;
      if (expiryTimer.current !== null) window.clearTimeout(expiryTimer.current);
      releaseTelegramPopup(popupOwner.current, true);
      currentProps.current.onBusyChange?.(false);
    };
    // A new authenticated session requires a new, server-bound authorization request.
  }, [accessToken, props.intent]);

  function open() {
    if (!request || !sdk.current || busy || props.disabled) return;
    if (!reserveTelegramPopup(popupOwner.current)) return;
    const currentGeneration = generation.current;
    setWaiting(true);
    setError(null);
    // The SDK opens during the click gesture; the nonce was prepared beforehand.
    try {
      sdk.current.auth(
        { client_id: request.clientId, scope: ["profile", "write"], nonce: request.nonce },
        (result) => {
          void (async () => {
            if (generation.current !== currentGeneration) return;
            if (!result?.id_token) {
              setWaiting(false);
              releaseTelegramPopup(popupOwner.current, true);
              if (result?.error === "popup_closed") {
                void prepare();
                return;
              }
              setRequest(null);
              setError("auth.telegram.official.error.popup");
              return;
            }
            try {
              const options = currentProps.current;
              if (options.intent === "link") {
                await completeTelegramOfficialLink(request, result.id_token, options.accessToken);
                if (generation.current !== currentGeneration) return;
                setWaiting(false);
                generation.current += 1;
                if (expiryTimer.current !== null) window.clearTimeout(expiryTimer.current);
                releaseTelegramPopup(popupOwner.current, true);
                options.onSuccess();
              } else {
                const auth = await completeTelegramOfficialLogin(request, result.id_token);
                if (generation.current !== currentGeneration) return;
                setWaiting(false);
                generation.current += 1;
                if (expiryTimer.current !== null) window.clearTimeout(expiryTimer.current);
                releaseTelegramPopup(popupOwner.current, true);
                options.onSuccess(auth);
              }
            } catch (failure) {
              if (generation.current !== currentGeneration) return;
              setWaiting(false);
              releaseTelegramPopup(popupOwner.current, true);
              setRequest(null);
              setError(readError(failure));
            }
          })();
        }
      );
    } catch {
      setWaiting(false);
      releaseTelegramPopup(popupOwner.current, true);
      setRequest(null);
      setError("auth.telegram.official.error.popup");
    }
  }

  function cancel() {
    generation.current += 1;
    releaseTelegramPopup(popupOwner.current, true);
    setWaiting(false);
    void prepare();
  }

  return (
    <div className="telegram-browser-login">
      <button
        className={props.buttonClassName ?? "telegram-browser-login__button"}
        type="button"
        disabled={props.disabled || busy || (!request && !error)}
        onClick={() => {
          if (error) void prepare();
          else open();
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.7 4.35 18.6 19c-.23 1.04-.84 1.3-1.7.81l-4.7-3.47-2.27 2.18c-.25.25-.46.46-.94.46l.34-4.78 8.7-7.86c.38-.34-.08-.53-.6-.19L6.68 13.02l-4.64-1.45c-1.01-.31-1.03-1.01.21-1.49L20.4 3.23c.84-.31 1.58.2 1.3 1.12Z" />
        </svg>
        {error
          ? t("dota.tournaments.telegram.retry")
          : busy
            ? t("auth.telegram.official.waiting")
            : !request
              ? t("auth.telegram.preparing")
              : props.intent === "link"
                ? t("auth.telegram.official.connect")
                : t("auth.telegram.button")}
      </button>
      {props.intent === "login" ? (
        <p className="telegram-browser-login__hint">{t("auth.telegram.official.hint")}</p>
      ) : null}
      {busy ? (
        <button className="telegram-browser-login__cancel" type="button" onClick={cancel}>
          {t("auth.telegram.cancel")}
        </button>
      ) : null}
      {error ? (
        <p className="telegram-browser-login__error" role="alert">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

function readError(error: unknown): ErrorKey {
  if (!(error instanceof ApiError)) return "auth.telegram.official.error.start";
  const body = error.body as { error?: { code?: string } } | null;
  switch (body?.error?.code) {
    case "TELEGRAM_NOT_LINKED":
      return "auth.telegram.official.error.notLinked";
    case "TELEGRAM_BOT_ACCESS_REQUIRED":
      return "auth.telegram.official.error.botAccess";
    case "TELEGRAM_AUTH_INVALID":
      return "auth.telegram.official.error.invalid";
    default:
      return error.status === 409
        ? "auth.telegram.official.error.conflict"
        : "auth.telegram.official.error.start";
  }
}
