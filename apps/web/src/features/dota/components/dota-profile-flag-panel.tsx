"use client";

import { useMemo } from "react";

import {
  DOTA_FLAG_LIMIT_PER_SIDE,
  type DotaGreenFlagKey,
  type DotaRedFlagKey
} from "@reviewo/shared";

import { useTranslation } from "../../i18n/locale-provider";
import type { useDotaProfileConfirmations } from "../hooks/use-dota-profile-confirmations";
import { getDotaGreenFlagLabel, getDotaRedFlagLabel } from "../lib/labels";
import type { DotaProfile } from "../types/dota";
import styles from "./dota-profile-flag-panel.module.css";

interface DotaProfileFlagPanelProps {
  confirmations: ReturnType<typeof useDotaProfileConfirmations>;
  flagKeys: readonly string[];
  polarity: "green" | "red";
  profile: DotaProfile;
}

export function DotaProfileFlagPanel({
  confirmations,
  flagKeys,
  polarity,
  profile
}: DotaProfileFlagPanelProps) {
  const t = useTranslation();
  const { canConfirm, confirmedKeys, pendingKeys, toggleKey } = confirmations;

  const titleKey =
    polarity === "green" ? "dota.profile.greenFlagsTitle" : "dota.profile.redFlagsTitle";
  const hintKey = polarity === "green" ? "dota.profile.greenFlagsHint" : "dota.profile.redFlagsHint";
  const getLabel =
    polarity === "green"
      ? (key: string) => getDotaGreenFlagLabel(key as DotaGreenFlagKey, t)
      : (key: string) => getDotaRedFlagLabel(key as DotaRedFlagKey, t);

  const selectedCount = useMemo(
    () =>
      confirmedKeys.filter((key) => flagKeys.includes(key)).length,
    [confirmedKeys, flagKeys]
  );

  const visibleFlagKeys = useMemo(() => {
    const ranked = [...flagKeys].sort((left, right) => {
      const leftCount = profile.qualities[left] ?? 0;
      const rightCount = profile.qualities[right] ?? 0;

      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      return flagKeys.indexOf(left) - flagKeys.indexOf(right);
    });

    if (canConfirm) {
      return ranked;
    }

    return ranked.filter((flagKey) => (profile.qualities[flagKey] ?? 0) > 0);
  }, [canConfirm, flagKeys, profile.qualities]);

  return (
    <section className={`${styles.panel} ${styles[polarity]}`}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <h2>{t(titleKey)}</h2>
          {canConfirm ? (
            <p>{t(hintKey, { limit: String(DOTA_FLAG_LIMIT_PER_SIDE) })}</p>
          ) : null}
        </div>
        {canConfirm ? (
          <span className={styles.selectedBadge}>
            {t("dota.flags.selectedCount", {
              current: String(selectedCount),
              limit: String(DOTA_FLAG_LIMIT_PER_SIDE)
            })}
          </span>
        ) : null}
      </div>

      <ul className={`${styles.list} ${canConfirm ? styles.listCompact : ""}`}>
        {visibleFlagKeys.length === 0 ? (
          <li className={styles.emptyState}>{t("dota.flags.empty")}</li>
        ) : (
          visibleFlagKeys.map((flagKey) => {
            const isConfirmed = confirmedKeys.includes(flagKey);
            const isPending = pendingKeys.includes(flagKey);
            const count = profile.qualities[flagKey] ?? 0;

            if (canConfirm) {
              return (
                <li key={flagKey}>
                  <button
                    aria-pressed={isConfirmed}
                    className={`${styles.flagButton} ${isConfirmed ? styles.flagButtonSelected : ""} ${isPending ? styles.flagButtonPending : ""}`}
                    disabled={isPending}
                    onClick={() => void toggleKey(flagKey)}
                    type="button"
                  >
                    <span className={styles.flagLabel}>
                      {isConfirmed ? (
                        <span aria-hidden className={styles.checkmark}>
                          ✓
                        </span>
                      ) : null}
                      <span className={styles.flagText}>{getLabel(flagKey)}</span>
                    </span>
                    {count > 0 ? <span className={styles.countBadge}>{count}</span> : null}
                  </button>
                </li>
              );
            }

            return (
              <li key={flagKey}>
                <div className={`${styles.flagReadonly} ${styles.flagReadonlyHasCount}`}>
                  <span className={styles.flagText}>{getLabel(flagKey)}</span>
                  <span className={styles.countBadge}>{count}</span>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
