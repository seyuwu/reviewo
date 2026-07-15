"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { peekDotaRecovery, type StoredDotaRecovery } from "../lib/recovery-storage";
import styles from "./dota-recovery-notice.module.css";

interface DotaRecoveryNoticeProps {
  slug: string;
}

export function DotaRecoveryNotice({ slug }: DotaRecoveryNoticeProps) {
  const t = useTranslation();
  const [recovery, setRecovery] = useState<StoredDotaRecovery | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRecovery(peekDotaRecovery(slug));
  }, [slug]);

  if (!recovery) {
    return null;
  }

  async function handleCopy() {
    if (!recovery) {
      return;
    }

    try {
      await navigator.clipboard.writeText(recovery.recoveryUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className={styles.notice}>
      <p className={styles.title}>{t("dota.profile.recoveryTitle")}</p>
      <p className={styles.hint}>{t("dota.profile.recoveryHint")}</p>
      <code className={styles.url}>{recovery.recoveryUrl}</code>
      <button className="secondary-button" onClick={() => void handleCopy()} type="button">
        {copied ? t("dota.profile.recoveryCopied") : t("dota.profile.recoveryCopy")}
      </button>
    </aside>
  );
}
