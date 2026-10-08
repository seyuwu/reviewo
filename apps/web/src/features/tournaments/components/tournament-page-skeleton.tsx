"use client";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./dota-tournaments-view.module.css";

export function TournamentCardsSkeleton() {
  return Array.from({ length: 2 }, (_, index) => (
    <div aria-hidden="true" className={styles.cardSkeleton} key={index}>
      <span className={`${styles.skeletonBar} ${styles.skeletonStatus}`} />
      <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`} />
      <span className={`${styles.skeletonBar} ${styles.skeletonDescription}`} />
      <span className={`${styles.skeletonBar} ${styles.skeletonDescriptionShort}`} />
      <span className={`${styles.skeletonBar} ${styles.skeletonMeta}`} />
      <span className={`${styles.skeletonBar} ${styles.skeletonAction}`} />
    </div>
  ));
}

export function TournamentPageSkeleton({ detail = false }: { detail?: boolean }) {
  const t = useTranslation();
  return (
    <main className="shell entity-route" aria-busy="true">
      <section className={styles.page}>
        <span className={styles.visuallyHidden} role="status">{t("common.loadingEllipsis")}</span>
        <header aria-hidden="true" className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{t("dota.tournaments.eyebrow")}</p>
            {detail ? <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`} /> : (
              <><h1>{t("dota.tournaments.title")}</h1><p>{t("dota.tournaments.lead")}</p></>
            )}
          </div>
          <div className={styles.heroActions}>
            <span className={`${styles.skeletonBar} ${styles.skeletonHeroAction}`} />
          </div>
        </header>
        <div className={`${styles.grid} ${styles.directoryGrid}`}><TournamentCardsSkeleton /></div>
      </section>
    </main>
  );
}
