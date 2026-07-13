"use client";

import { DOTA_QUALITY_KEYS } from "@reviewo/shared";

import { useTranslation } from "../../i18n/locale-provider";
import type { useDotaProfileConfirmations } from "../hooks/use-dota-profile-confirmations";
import { getDotaQualityLabel } from "../lib/labels";
import type { DotaProfile } from "../types/dota";
import styles from "./dota-profile-qualities.module.css";

interface DotaProfileQualitiesProps {
  confirmations: ReturnType<typeof useDotaProfileConfirmations>;
  profile: DotaProfile;
}

export function DotaProfileQualities({ confirmations, profile }: DotaProfileQualitiesProps) {
  const t = useTranslation();
  const { canConfirm, confirmedKeys, pendingKeys, toggleKey } = confirmations;

  return (
    <section className={`panel-card ${styles.panel}`}>
      <div className={styles.header}>
        <h2>{t("dota.profile.qualitiesTitle")}</h2>
        {canConfirm ? <p>{t("dota.profile.qualitiesHint")}</p> : null}
      </div>

      <ul className={styles.list}>
        {DOTA_QUALITY_KEYS.map((qualityKey) => {
          const isConfirmed = confirmedKeys.includes(qualityKey);
          const isPending = pendingKeys.includes(qualityKey);
          const count = profile.qualities[qualityKey] ?? 0;

          if (canConfirm) {
            return (
              <li key={qualityKey}>
                <button
                  aria-pressed={isConfirmed}
                  className={`${styles.qualityButton} ${isConfirmed ? styles.qualityButtonSelected : ""} ${isPending ? styles.qualityButtonPending : ""}`}
                  disabled={isPending}
                  onClick={() => void toggleKey(qualityKey)}
                  type="button"
                >
                  <span className={styles.qualityLabel}>
                    {isConfirmed ? (
                      <span aria-hidden className={styles.checkmark}>
                        ✓
                      </span>
                    ) : null}
                    {getDotaQualityLabel(qualityKey, t)}
                  </span>
                  <strong>{count}</strong>
                </button>
              </li>
            );
          }

          return (
            <li key={qualityKey}>
              <div className={styles.qualityReadonly}>
                <span>{getDotaQualityLabel(qualityKey, t)}</span>
                <strong>{count}</strong>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
