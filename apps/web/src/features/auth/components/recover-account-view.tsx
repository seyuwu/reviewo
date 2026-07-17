"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { recoverAccount } from "../api/guest-auth";
import { useAuthSession } from "../hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchMyDotaProfile } from "../../dota/api/dota-api";
import { stashDotaRecovery } from "../../dota/lib/recovery-storage";
import type { AuthResponse } from "../types/auth";

type RecoverResponse = AuthResponse & {
  recoveryToken: string;
  recoveryUrl: string;
};

const POST_RECOVER_PATH_KEY = "opinia.recover.postPath";

/** Deduplicate Strict Mode double-mount — recovery tokens are single-use. */
const recoverInFlight = new Map<string, Promise<RecoverResponse>>();

function recoverAccountOnce(token: string): Promise<RecoverResponse> {
  const existing = recoverInFlight.get(token);

  if (existing) {
    return existing;
  }

  const request = recoverAccount(token) as Promise<RecoverResponse>;
  recoverInFlight.set(token, request);
  return request;
}

function readPendingRecoverPath(): string | null {
  try {
    return window.sessionStorage.getItem(POST_RECOVER_PATH_KEY);
  } catch {
    return null;
  }
}

function writePendingRecoverPath(path: string): void {
  try {
    window.sessionStorage.setItem(POST_RECOVER_PATH_KEY, path);
  } catch {
    /* ignore */
  }
}

function clearPendingRecoverPath(): void {
  try {
    window.sessionStorage.removeItem(POST_RECOVER_PATH_KEY);
  } catch {
    /* ignore */
  }
}

export function RecoverAccountView() {
  const t = useTranslation();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { storeAuthSession } = useAuthSession();
  const [error, setError] = useState<string | null>(null);
  const token = typeof params.token === "string" ? params.token : "";

  useEffect(() => {
    const pendingPath = readPendingRecoverPath();

    if (pendingPath?.startsWith("/")) {
      clearPendingRecoverPath();
      router.replace(pendingPath);
      return;
    }

    if (!token) {
      setError(t("auth.recover.error"));
      return;
    }

    let cancelled = false;

    void recoverAccountOnce(token)
      .then(async (response) => {
        // Always persist session — Strict Mode may cancel the first effect after the API succeeds.
        storeAuthSession({
          accessToken: response.accessToken,
          expiresIn: response.expiresIn,
          tokenType: response.tokenType,
          user: response.user
        });

        let nextPath = "/dota";

        try {
          const profile = await fetchMyDotaProfile(response.accessToken);
          stashDotaRecovery({
            recoveryToken: response.recoveryToken,
            recoveryUrl: response.recoveryUrl,
            slug: profile.slug
          });
          nextPath = `/dota/${profile.slug}`;
        } catch {
          /* profile fetch can fail; still land on /dota signed-in */
        }

        if (cancelled) {
          writePendingRecoverPath(nextPath);
          return;
        }

        clearPendingRecoverPath();
        router.replace(nextPath);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("auth.recover.error"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, storeAuthSession, t, token]);

  return (
    <main className="shell entity-route">
      <section className="creation-card" style={{ margin: "2rem auto", maxWidth: "32rem", padding: "1.5rem" }}>
        {error ? (
          <>
            <p>{error}</p>
            <Link className="button-secondary" href="/dota">
              {t("auth.recover.retryHome")}
            </Link>
          </>
        ) : (
          <p>{t("auth.recover.loading")}</p>
        )}
      </section>
    </main>
  );
}
