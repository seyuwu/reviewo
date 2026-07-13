"use client";

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

  function handleSingleChange(value: string) {
    const normalized = value.replace(/\D/g, "").slice(0, 5);
    onChange(normalized, normalized);
  }

  function handleFromChange(value: string) {
    onChange(value.replace(/\D/g, "").slice(0, 5), mmrTo);
  }

  function handleToChange(value: string) {
    onChange(mmrFrom, value.replace(/\D/g, "").slice(0, 5));
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
