"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DOTA_FLAG_LIMIT_PER_SIDE,
  DOTA_GREEN_FLAG_KEYS,
  DOTA_RED_FLAG_KEYS,
  type DotaGreenFlagKey,
  type DotaRedFlagKey
} from "@reviewo/shared";
import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { confirmDotaQualities } from "../api/dota-api";
import { trackDotaEvent } from "../lib/analytics";
import { getDotaGreenFlagLabel, getDotaRedFlagLabel } from "../lib/labels";
import { getOrCreateDotaVisitorId } from "../lib/visitor-id";
import type { DotaProfile } from "../types/dota";
import styles from "./dota-confirm-view.module.css";

interface DotaConfirmViewProps {
  profile: DotaProfile;
}

export function DotaConfirmView({ profile }: DotaConfirmViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const greenOptions = useMemo(() => [...DOTA_GREEN_FLAG_KEYS], []);
  const redOptions = useMemo(() => [...DOTA_RED_FLAG_KEYS], []);

  const greenSelected = selectedKeys.filter((key) =>
    (DOTA_GREEN_FLAG_KEYS as readonly string[]).includes(key)
  ).length;
  const redSelected = selectedKeys.filter((key) =>
    (DOTA_RED_FLAG_KEYS as readonly string[]).includes(key)
  ).length;

  function toggleFlag(key: string, polarity: "green" | "red") {
    setSelectedKeys((current) => {
      if (current.includes(key)) {
        return current.filter((value) => value !== key);
      }

      const sideKeys = polarity === "green" ? DOTA_GREEN_FLAG_KEYS : DOTA_RED_FLAG_KEYS;
      const sideCount = current.filter((value) =>
        (sideKeys as readonly string[]).includes(value)
      ).length;

      if (sideCount >= DOTA_FLAG_LIMIT_PER_SIDE) {
        return current;
      }

      return [...current, key];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await confirmDotaQualities(
        profile.slug,
        selectedKeys,
        getOrCreateDotaVisitorId(),
        authSession?.accessToken
      );
      setSuccess(true);
      trackDotaEvent("dota_confirmation_submitted", { slug: profile.slug });
      router.refresh();
    } catch {
      setError(t("dota.confirm.error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>{t("dota.confirm.eyebrow")}</p>
      <h1>{t("dota.confirm.title", { name: profile.title })}</h1>
      <p className={styles.lead}>{t("dota.confirm.lead")}</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.flagGrid}>
          <section className={`${styles.flagPanel} ${styles.green}`}>
            <div className={styles.flagHeader}>
              <h2>{t("dota.profile.greenFlagsTitle")}</h2>
              <span>
                {t("dota.flags.selectedCount", {
                  current: String(greenSelected),
                  limit: String(DOTA_FLAG_LIMIT_PER_SIDE)
                })}
              </span>
            </div>
            <div className={styles.options}>
              {greenOptions.map((flagKey) => (
                <label className={styles.option} key={flagKey}>
                  <input
                    checked={selectedKeys.includes(flagKey)}
                    onChange={() => toggleFlag(flagKey, "green")}
                    type="checkbox"
                  />
                  <span>{getDotaGreenFlagLabel(flagKey as DotaGreenFlagKey, t)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className={`${styles.flagPanel} ${styles.red}`}>
            <div className={styles.flagHeader}>
              <h2>{t("dota.profile.redFlagsTitle")}</h2>
              <span>
                {t("dota.flags.selectedCount", {
                  current: String(redSelected),
                  limit: String(DOTA_FLAG_LIMIT_PER_SIDE)
                })}
              </span>
            </div>
            <div className={styles.options}>
              {redOptions.map((flagKey) => (
                <label className={styles.option} key={flagKey}>
                  <input
                    checked={selectedKeys.includes(flagKey)}
                    onChange={() => toggleFlag(flagKey, "red")}
                    type="checkbox"
                  />
                  <span>{getDotaRedFlagLabel(flagKey as DotaRedFlagKey, t)}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {error ? <FormFeedback errorMessage={error} /> : null}
        {success ? <FormFeedback statusMessage={t("dota.confirm.success")} /> : null}

        <button
          className="app-nav-cta"
          disabled={isSubmitting || selectedKeys.length === 0}
          type="submit"
        >
          {isSubmitting ? t("dota.confirm.submitting") : t("dota.confirm.submit")}
        </button>
      </form>

      <div className={styles.footer}>
        <p>{t("dota.confirm.footer")}</p>
        <Link
          className="app-nav-cta"
          href="/dota/create"
          onClick={() => trackDotaEvent("dota_confirmer_signup_started", { slug: profile.slug })}
        >
          {t("dota.confirm.createOwn")}
        </Link>
      </div>
    </section>
  );
}
