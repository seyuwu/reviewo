"use client";

import { useTranslation } from "../../i18n/locale-provider";
import { useGamesLaunchStatus } from "../../games/hooks/use-games-launch-status";
import styles from "./dota-profile-waitlist-cta.module.css";

const TELEGRAM_CHANNEL_URL = "https://t.me/opinia_official";

/** Big visitor-facing waitlist promo on public Dota profiles while search is closed. */
export function DotaProfileWaitlistCta() {
  const t = useTranslation();
  const { status, isLoading } = useGamesLaunchStatus();

  if (isLoading || status.searchLive) {
    return null;
  }

  return (
    <aside className={styles.cta} data-analytics="dota_profile_waitlist_cta">
      <h2 className={styles.title}>{t("dota.profile.waitlistCta.title")}</h2>
      <p className={styles.lead}>{t("dota.profile.waitlistCta.lead")}</p>
      <a
        className={`button-primary ${styles.button}`}
        href={TELEGRAM_CHANNEL_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("dota.profile.waitlistCta.cta")}
      </a>
    </aside>
  );
}
