"use client";

import { useEffect, useState } from "react";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  fetchDotaTelegramContact,
  setDotaTelegramVisibility,
  type DotaTelegramContact
} from "../api/dota-api";
import styles from "./dota-telegram-contact.module.css";

export function DotaTelegramContactField({ slug }: { slug: string }) {
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  if (!isAuthSessionLoaded) return null;
  return (
    <Contact
      key={`${slug}:${authSession?.userId ?? "guest"}`}
      slug={slug}
      accessToken={authSession?.accessToken}
    />
  );
}

function Contact({ slug, accessToken }: { slug: string; accessToken: string | undefined }) {
  const t = useTranslation();
  const [contact, setContact] = useState<DotaTelegramContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setContact(null);
    void fetchDotaTelegramContact(slug, accessToken)
      .then((data) => {
        if (active) setContact(data);
      })
      .catch(() => {
        if (active) setContact(null);
      });
    return () => {
      active = false;
    };
  }, [slug, accessToken]);

  async function toggle(visible: boolean) {
    if (!accessToken || busy) return;
    setBusy(true);
    setError(false);
    try {
      setContact(await setDotaTelegramVisibility(visible, accessToken));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!contact || (!contact.username && !contact.isOwner)) return null;
  return (
    <section className={styles.card} aria-label="Telegram">
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true">
          ↗
        </span>
        <div>
          <span className={styles.label}>Telegram</span>
          {contact.username ? (
            <a
              href={`https://t.me/${encodeURIComponent(contact.username)}`}
              target="_blank"
              rel="noreferrer"
            >
              @{contact.username}
            </a>
          ) : (
            <p>{t("dota.telegram.noUsername")}</p>
          )}
        </div>
        {contact.isAdminView ? (
          <span className={styles.badge}>{t("dota.telegram.adminOnly")}</span>
        ) : null}
      </div>
      {contact.isOwner ? (
        <div className={styles.settings}>
          <label>
            <input
              type="checkbox"
              checked={contact.visible}
              disabled={busy}
              onChange={(event) => void toggle(event.target.checked)}
            />
            {t("dota.telegram.showContact")}
          </label>
          <small>{t("dota.telegram.privacyHint")}</small>
          {!contact.username ? (
            <a href="https://t.me/FDPdotabot" target="_blank" rel="noreferrer">
              {t("dota.telegram.openBot")}
            </a>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {t("dota.telegram.saveError")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
