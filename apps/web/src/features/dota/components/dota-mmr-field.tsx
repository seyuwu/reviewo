"use client";

import { DOTA_MMR_MAX } from "@reviewo/shared";
import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./dota-mmr-field.module.css";

interface DotaMmrFieldProps {
  mmrFrom: string;
  mmrTo: string;
  onChange: (from: string, to: string) => void;
}

export function DotaMmrField({ mmrFrom, mmrTo, onChange }: DotaMmrFieldProps) {
  const t = useTranslation();
  const [mmrMode, setMmrMode] = useState<"single" | "range">(() =>
    mmrFrom.trim() && mmrTo.trim() && mmrFrom.trim() !== mmrTo.trim() ? "range" : "single"
  );
  const singleValue = mmrFrom === mmrTo ? mmrFrom : mmrFrom || mmrTo;

  function switchToSingle() {
    const nextValue = singleValue.trim() || mmrFrom.trim() || mmrTo.trim();
    setMmrMode("single");
    onChange(nextValue, nextValue);
  }

  function switchToRange() {
    setMmrMode("range");
    onChange(mmrFrom.trim() || singleValue, mmrTo.trim() && mmrTo !== mmrFrom ? mmrTo : "");
  }

  function normalizeMmrDigits(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 5);

    if (!digits) {
      return "";
    }

    return String(Math.min(Number(digits), DOTA_MMR_MAX));
  }

  function handleSingleChange(value: string) {
    const normalized = normalizeMmrDigits(value);
    onChange(normalized, normalized);
  }

  function handleFromChange(value: string) {
    onChange(normalizeMmrDigits(value), mmrTo);
  }

  function handleToChange(value: string) {
    onChange(mmrFrom, normalizeMmrDigits(value));
  }

  return (
    <div className={styles.mmrField}>
      {mmrMode === "single" ? (
        <>
          <input
            className={styles.singleInput}
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => handleSingleChange(event.target.value)}
            placeholder="3500"
            value={singleValue}
          />
          <button className={styles.modeLink} onClick={switchToRange} type="button">
            {t("dota.create.mmrUseRange")}
          </button>
        </>
      ) : (
        <>
          <div className={styles.rangeRow}>
            <input
              aria-label={t("dota.create.mmrFrom")}
              className={styles.rangeInput}
              inputMode="numeric"
              maxLength={5}
              onChange={(event) => handleFromChange(event.target.value)}
              placeholder="3000"
              value={mmrFrom}
            />
            <span aria-hidden className={styles.rangeDivider}>
              —
            </span>
            <input
              aria-label={t("dota.create.mmrTo")}
              className={styles.rangeInput}
              inputMode="numeric"
              maxLength={5}
              onChange={(event) => handleToChange(event.target.value)}
              placeholder="4000"
              value={mmrTo}
            />
          </div>
          <button className={styles.modeLink} onClick={switchToSingle} type="button">
            {t("dota.create.mmrUseSingle")}
          </button>
        </>
      )}
    </div>
  );
}
