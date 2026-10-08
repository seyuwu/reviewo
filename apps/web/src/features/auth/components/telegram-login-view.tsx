"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  exchangeTelegramWebAccessTicket,
  loginWithTelegram,
  type TelegramLoginPayload
} from "../api/telegram-login";
import { useAuthSession } from "../hooks/use-auth-session";

const loginRequests = new Map<string, ReturnType<typeof loginWithTelegram>>();

export function TelegramLoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded, storeAuthSession } = useAuthSession();
  const [error, setError] = useState<string | null>(null);
  const completedLoginRequestKey = useRef<string | null>(null);
  const webAccessTicket = searchParams.get("ticket");
  const nextPath = useMemo(() => safePartyPath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }
    const payload = readTelegramPayload(searchParams);
    const hasValidWebAccessTicket = Boolean(
      webAccessTicket && /^[A-Za-z0-9_-]{43}$/.test(webAccessTicket)
    );
    // A Telegram ticket or signed Telegram Login payload identifies the account
    // the user opened this link for. Prefer it over a possibly different browser session.
    if (!payload && !hasValidWebAccessTicket && authSession) {
      router.replace(nextPath);
      return;
    }
    if (!payload && !hasValidWebAccessTicket) {
      setError(
        "Ссылка входа недействительна. Вернитесь в бота и нажмите кнопку открытия сайта ещё раз."
      );
      return;
    }

    const requestKey = webAccessTicket ? `ticket:${webAccessTicket}` : `telegram:${payload?.hash}`;
    if (completedLoginRequestKey.current === requestKey) {
      router.replace(nextPath);
      return;
    }

    // Telegram's signed login fields must not remain in browser history or analytics URLs.
    window.history.replaceState(
      window.history.state,
      "",
      `/telegram/access?next=${encodeURIComponent(nextPath)}`
    );

    let cancelled = false;
    let request = loginRequests.get(requestKey);
    if (!request) {
      request = hasValidWebAccessTicket
        ? exchangeTelegramWebAccessTicket(webAccessTicket!)
        : loginWithTelegram(payload!);
      loginRequests.set(requestKey, request);
    }

    void request
      .then((response) => {
        if (!cancelled) {
          completedLoginRequestKey.current = requestKey;
          storeAuthSession(response);
          router.replace(nextPath);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            hasValidWebAccessTicket
              ? "Ссылка входа устарела или уже использована. Вернитесь в бота и откройте сайт ещё раз."
              : "Не удалось войти через Telegram. Вернитесь в бота и откройте сайт оттуда ещё раз."
          );
        }
      })
      .finally(() => {
        loginRequests.delete(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    authSession,
    isAuthSessionLoaded,
    nextPath,
    router,
    searchParams,
    storeAuthSession,
    webAccessTicket
  ]);

  return (
    <main className="shell entity-route">
      <section
        className="creation-card"
        style={{ margin: "2rem auto", maxWidth: "32rem", padding: "1.5rem" }}
      >
        {error ? (
          <>
            <p>{error}</p>
            <Link className="button-secondary" href={nextPath}>
              Открыть страницу пати
            </Link>
          </>
        ) : (
          <p>Входим в аккаунт FDP…</p>
        )}
      </section>
    </main>
  );
}

function readTelegramPayload(params: URLSearchParams): TelegramLoginPayload | null {
  const id = params.get("id");
  const authDate = params.get("auth_date");
  const firstName = params.get("first_name");
  const hash = params.get("hash");
  if (!id || !authDate || !firstName || !hash) {
    return null;
  }

  return {
    auth_date: authDate,
    first_name: firstName,
    hash,
    id,
    ...(params.has("last_name") ? { last_name: params.get("last_name") ?? "" } : {}),
    ...(params.has("username") ? { username: params.get("username") ?? "" } : {}),
    ...(params.has("photo_url") ? { photo_url: params.get("photo_url") ?? "" } : {})
  };
}

function safePartyPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/dota";
  }
  try {
    const target = new URL(value, "https://opinia.invalid");
    if (
      target.origin !== "https://opinia.invalid" ||
      (target.pathname !== "/profile" && !target.pathname.startsWith("/dota/teams/"))
    ) {
      return "/dota";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/dota";
  }
}
