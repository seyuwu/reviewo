"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { loginWithTelegram, type TelegramLoginPayload } from "../api/telegram-login";
import { useAuthSession } from "../hooks/use-auth-session";

const loginRequests = new Map<string, ReturnType<typeof loginWithTelegram>>();

export function TelegramLoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded, storeAuthSession } = useAuthSession();
  const [error, setError] = useState<string | null>(null);
  const loginStarted = useRef(false);
  const nextPath = useMemo(() => safePartyPath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }
    if (authSession) {
      router.replace(nextPath);
      return;
    }
    if (loginStarted.current) {
      return;
    }

    const payload = readTelegramPayload(searchParams);
    if (!payload) {
      setError(
        "Telegram не передал данные для входа. Нажмите кнопку входа в боте и подтвердите авторизацию."
      );
      return;
    }

    loginStarted.current = true;
    // Telegram's signed login fields must not remain in browser history or analytics URLs.
    window.history.replaceState(
      window.history.state,
      "",
      `/telegram/access?next=${encodeURIComponent(nextPath)}`
    );

    let cancelled = false;
    let request = loginRequests.get(payload.hash);
    if (!request) {
      request = loginWithTelegram(payload);
      loginRequests.set(payload.hash, request);
    }

    void request
      .then((response) => {
        storeAuthSession(response);
        if (!cancelled) {
          router.replace(nextPath);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Не удалось войти через Telegram. Проверьте, что этот Telegram привязан к аккаунту Opinia, и попробуйте ещё раз из бота."
          );
        }
      })
      .finally(() => {
        loginRequests.delete(payload.hash);
      });

    return () => {
      cancelled = true;
    };
  }, [authSession, isAuthSessionLoaded, nextPath, router, searchParams, storeAuthSession]);

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
          <p>Входим в Opinia и открываем страницу пати…</p>
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
    if (target.origin !== "https://opinia.invalid" || !target.pathname.startsWith("/dota/teams/")) {
      return "/dota";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/dota";
  }
}
