"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DOTA_QUALITY_KEYS } from "@reviewo/shared";
import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { confirmDotaQualities } from "../api/dota-api";
import { trackDotaEvent } from "../lib/analytics";
import { getDotaQualityLabel } from "../lib/labels";
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

  const qualityOptions = useMemo(() => [...DOTA_QUALITY_KEYS], []);

  function toggleQuality(key: string) {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    );
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
        <div className={styles.options}>
          {qualityOptions.map((qualityKey) => (
            <label className={styles.option} key={qualityKey}>
              <input
                checked={selectedKeys.includes(qualityKey)}
                onChange={() => toggleQuality(qualityKey)}
                type="checkbox"
              />
              <span>{getDotaQualityLabel(qualityKey, t)}</span>
            </label>
          ))}
        </div>

        {error ? <FormFeedback errorMessage={error} /> : null}
        {success ? <FormFeedback statusMessage={t("dota.confirm.success")} /> : null}

        <button className="app-nav-cta" disabled={isSubmitting || selectedKeys.length === 0} type="submit">
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
