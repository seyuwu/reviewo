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

export function RecoverAccountView() {
  const t = useTranslation();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { storeAuthSession } = useAuthSession();
  const [error, setError] = useState<string | null>(null);
  const token = typeof params.token === "string" ? params.token : "";

  useEffect(() => {
    if (!token) {
      setError(t("auth.recover.error"));
      return;
    }

    let cancelled = false;

    void recoverAccount(token)
      .then(async (response: RecoverResponse) => {
        if (cancelled) {
          return;
        }

        storeAuthSession({
          accessToken: response.accessToken,
          expiresIn: response.expiresIn,
          tokenType: response.tokenType,
          user: response.user
        });

        try {
          const profile = await fetchMyDotaProfile(response.accessToken);
          stashDotaRecovery({
            recoveryToken: response.recoveryToken,
            recoveryUrl: response.recoveryUrl,
            slug: profile.slug
          });
          router.replace(`/dota/${profile.slug}`);
        } catch {
          router.replace("/dota");
        }
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
