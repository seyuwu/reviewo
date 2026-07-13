"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./games-hub-view.module.css";

export function GamesHubView() {
  const t = useTranslation();

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>{t("games.hub.eyebrow")}</p>
      <h1 className={styles.title}>{t("games.hub.title")}</h1>
      <p className={styles.lead}>{t("games.hub.lead")}</p>

      <div className={styles.grid}>
        <Link className={styles.card} href="/dota">
          <h2 className={styles.cardTitle}>{t("games.hub.dota.title")}</h2>
          <p className={styles.cardLead}>{t("games.hub.dota.lead")}</p>
          <span className={styles.cardMeta}>{t("games.hub.dota.cta")}</span>
        </Link>
      </div>

      <p className={styles.hint}>{t("games.hub.moreSoon")}</p>
    </section>
  );
}
