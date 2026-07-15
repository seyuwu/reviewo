"use client";

import { FormEvent, useState } from "react";

import { claimEmail } from "../../auth/api/guest-auth";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { clearDotaRecovery } from "../lib/recovery-storage";
import styles from "./dota-claim-email-banner.module.css";

interface DotaClaimEmailBannerProps {
  isOwner: boolean;
}

export function DotaClaimEmailBanner({ isOwner }: DotaClaimEmailBannerProps) {
  const t = useTranslation();
  const { authSession, updateAuthSession } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOwner || !authSession?.accessToken || authSession.email || success) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await claimEmail(
        {
          email: email.trim(),
          password
        },
        authSession!.accessToken
      );
      updateAuthSession({
        displayName: user.displayName,
        email: user.email
      });
      clearDotaRecovery();
      setSuccess(true);
    } catch {
      setError(t("dota.profile.claimError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside className={styles.banner}>
      <p className={styles.title}>{t("dota.profile.claimTitle")}</p>
      <p className={styles.lead}>{t("dota.profile.claimLead")}</p>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <label className="field-label">
          {t("auth.field.email")}
          <input
            autoComplete="email"
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="field-label">
          {t("auth.field.password")}
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? t("dota.profile.claimSubmitting") : t("dota.profile.claimSubmit")}
        </button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {success ? <p className={styles.success}>{t("dota.profile.claimSuccess")}</p> : null}
    </aside>
  );
}
