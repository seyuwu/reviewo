"use client";

import { useState } from "react";
import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import styles from "./dota-id-copy-field.module.css";

interface DotaIdCopyFieldProps {
  accountId: string;
  showFillCta?: boolean;
}

export function DotaIdCopyField({ accountId, showFillCta = false }: DotaIdCopyFieldProps) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const hasAccountId = accountId.trim().length > 0;

  async function handleCopy() {
    if (!hasAccountId) {
      return;
    }

    const didCopy = await copyTextToClipboard(accountId);

    if (!didCopy) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!hasAccountId) {
    return (
      <div className={`profile-field ${styles.field}`}>
        <span>{t("dota.profile.dotaId")}</span>
        <strong className={styles.missingValue}>{t("dota.profile.dotaIdMissing")}</strong>
        {showFillCta ? (
          <Link className={styles.fillButton} href="/dota/create?focus=dotaId">
            {t("dota.profile.fillDotaId")}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`profile-field ${styles.field}`}>
      <span>{t("dota.profile.dotaId")}</span>
      <button
        className={styles.idValue}
        onClick={() => void handleCopy()}
        title={t("dota.profile.dotaIdCopyHint")}
        type="button"
      >
        <strong>{accountId}</strong>
      </button>
      <button className={styles.copyButton} onClick={() => void handleCopy()} type="button">
        {copied ? t("dota.share.copied") : t("dota.profile.copyDotaId")}
      </button>
    </div>
  );
}
