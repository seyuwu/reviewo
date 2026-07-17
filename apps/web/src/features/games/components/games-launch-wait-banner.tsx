"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import { useGamesLaunchStatus } from "../hooks/use-games-launch-status";
import styles from "./games-launch-wait-banner.module.css";

export function GamesLaunchWaitBanner({ showSearchLink = true }: { showSearchLink?: boolean }) {
  const t = useTranslation();
  const { status, isLoading } = useGamesLaunchStatus();

  // Avoid flashing the waitlist banner before status resolves (or while cached live).
  if (isLoading || status.searchLive) {
    return null;
  }

  const date = t("games.launch.waitlist.dateLabel");
  const time = t("games.launch.waitlist.timeLabel");

  return (
    <aside className={styles.banner} role="status">
      <p className={styles.copy}>{t("games.launch.profileBanner", { date, time })}</p>
      {showSearchLink ? (
        <Link className={styles.link} href="/games/search">
          {t("games.community.openSearch")}
        </Link>
      ) : null}
    </aside>
  );
}
