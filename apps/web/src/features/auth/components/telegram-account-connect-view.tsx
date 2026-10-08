"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { telegramAppUrl, telegramBotHandle } from "../../../lib/telegram/native-bot-link";
import { DOTA_BOT_USERNAME } from "../../../lib/config/dota-bot";
import { useTranslation } from "../../i18n/locale-provider";
import { createTelegramTournamentBotLink, pollTelegramTournamentBotLink } from "../../tournaments/api/telegram-bot-onboarding-api";
import { useAuthSession } from "../hooks/use-auth-session";
import { MinimalAuthPanel } from "./minimal-auth-panel";
import { TelegramBotHandle } from "./telegram-bot-handle";

type Attempt = { userId: string; requestId: string; botUrl: string; expiresAt: number };

export function TelegramAccountConnectView() {
  const t = useTranslation();
  const params = useSearchParams();
  const { authSession, isAuthSessionLoaded, storeAuthSession, signOut } = useAuthSession();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [status, setStatus] = useState<"idle" | "preparing" | "pending" | "approved" | "error">("idle");
  const [error, setError] = useState<"expired" | "conflict" | "connect" | null>(null);
  const generation = useRef(0);
  const timer = useRef<number | null>(null);
  const popup = useRef<Window | null>(null);
  const owner = useRef(authSession?.userId);
  owner.current = authSession?.userId;
  const autoStartedUser = useRef<string | null>(null);
  const beginRef = useRef<(launch: boolean) => Promise<void>>(async () => undefined);
  const fromBot = params.get("from") === "bot";

  useEffect(() => {
    generation.current++;
    if (timer.current !== null) window.clearTimeout(timer.current);
    popup.current?.close();
    popup.current = null;
    setAttempt(null);
    setStatus("idle");
    setError(null);
    return () => {
      generation.current++;
      if (timer.current !== null) window.clearTimeout(timer.current);
      popup.current?.close();
    };
  }, [authSession?.userId]);

  useEffect(() => {
    if (fromBot && isAuthSessionLoaded && authSession && status === "idle" && autoStartedUser.current !== authSession.userId) {
      autoStartedUser.current = authSession.userId;
      void beginRef.current(false);
    }
  }, [authSession, fromBot, isAuthSessionLoaded, status]);

  async function poll(request: Attempt, accessToken: string, currentGeneration: number) {
    if (generation.current !== currentGeneration || owner.current !== request.userId) return;
    if (Date.now() >= request.expiresAt) {
      setError("expired"); setStatus("error"); setAttempt(null); return;
    }
    try {
      const result = await pollTelegramTournamentBotLink(accessToken, request.requestId, true);
      if (generation.current !== currentGeneration || owner.current !== request.userId) return;
      if (result.status === "approved") {
        popup.current?.close(); popup.current = null;
        setStatus("approved"); setAttempt(null); return;
      }
      if (result.status === "conflict" || result.status === "expired") {
        setError(result.status); setStatus("error"); setAttempt(null); return;
      }
    } catch { /* Keep the same request during temporary connection failures. */ }
    if (generation.current === currentGeneration && owner.current === request.userId) {
      timer.current = window.setTimeout(() => void poll(request, accessToken, currentGeneration), 2500);
    }
  }

  async function begin(launch: boolean) {
    if (!authSession || status === "preparing" || status === "pending") return;
    const currentGeneration = ++generation.current;
    setError(null); setStatus("preparing");
    const opened = launch ? window.open("about:blank", "_blank") : null;
    if (opened) { opened.opener = null; popup.current = opened; }
    try {
      const result = await createTelegramTournamentBotLink(authSession.accessToken, true);
      if (generation.current !== currentGeneration || owner.current !== authSession.userId) return;
      if (result.botStarted || !/^[a-f0-9]{32}$/.test(result.requestId) ||
          new URL(result.botUrl).searchParams.get("start") !== `tournament_link_${result.requestId}` ||
          !Number.isInteger(result.expiresIn) || result.expiresIn <= 0 || result.expiresIn > 300) {
        throw new Error("Invalid Telegram linking request");
      }
      const appUrl = telegramAppUrl(result.botUrl);
      const request: Attempt = { ...result, userId: authSession.userId, expiresAt: Date.now() + result.expiresIn * 1000 };
      setAttempt(request); setStatus("pending");
      if (opened && !opened.closed) opened.location.replace(appUrl);
      void poll(request, authSession.accessToken, currentGeneration);
    } catch {
      if (generation.current === currentGeneration) {
        opened?.close(); popup.current = null; setError("connect"); setStatus("error");
      }
    }
  }
  beginRef.current = begin;
  const currentAttempt = attempt?.userId === authSession?.userId ? attempt : null;

  return (
    <main className="shell entity-route">
      <section className="telegram-account-connect">
        <h1>{t("auth.telegram.connectTitle")}</h1>
        {!isAuthSessionLoaded ? <p role="status">{t("common.loadingEllipsis")}</p> : !authSession ? (
          <>
            <p>{t("auth.telegram.connectLoginHint")}</p>
            <MinimalAuthPanel authSession={null} contextLabel={t("auth.telegram.connectLoginTitle")}
              onAuthSuccess={storeAuthSession} onSignOut={signOut} />
          </>
        ) : (
          <>
            <p>{t("auth.telegram.connectAccount")}</p>
            <strong className="telegram-account-connect__name">{authSession.displayName}</strong>
            <TelegramBotHandle handle={currentAttempt ? telegramBotHandle(currentAttempt.botUrl) : `@${DOTA_BOT_USERNAME}`} />
            {status === "approved" ? <p role="status">{t("auth.telegram.connectDone")}</p> : (
              <>
                <p>{t("auth.telegram.connectHint")}</p>
                {currentAttempt ? (
                  <a className="telegram-browser-login__open" href={telegramAppUrl(currentAttempt.botUrl)}>
                    {t("auth.telegram.enterBot")}
                  </a>
                ) : (
                  <button className="telegram-browser-login__button" type="button" disabled={status === "preparing"}
                    onClick={() => void begin(true)}>
                    {t(status === "preparing" ? "auth.telegram.preparing" : "auth.telegram.enterBot")}
                  </button>
                )}
                {currentAttempt ? <p role="status">{t("auth.telegram.waiting")}</p> : null}
              </>
            )}
            {error ? <p role="alert">{t(`auth.telegram.connectError.${error}`)}</p> : null}
          </>
        )}
      </section>
    </main>
  );
}
