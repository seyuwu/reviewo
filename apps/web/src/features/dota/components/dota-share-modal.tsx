"use client";

import { useEffect, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useTranslation } from "../../i18n/locale-provider";
import { buildDotaShareText, copyDotaShareText } from "../lib/share";
import { trackDotaEvent } from "../lib/analytics";
import type { DotaProfile, DotaShareKind } from "../types/dota";
import styles from "./dota-share-modal.module.css";

const SHARE_KINDS: DotaShareKind[] = ["profile", "confirm", "id"];

interface DotaShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DotaProfile;
}

export function DotaShareModal({ isOpen, onClose, profile }: DotaShareModalProps) {
  const t = useTranslation();
  const [copiedKind, setCopiedKind] = useState<DotaShareKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  async function handleCopy(kind: DotaShareKind) {
    setError(null);
    const copied = await copyDotaShareText(kind, profile, t);

    if (!copied) {
      setError(t("dota.share.copyError"));
      return;
    }

    setCopiedKind(kind);
    trackDotaEvent("dota_share_copied", { kind, slug: profile.slug });
    window.setTimeout(() => setCopiedKind(null), 2200);
  }

  return (
    <div
      className="growth-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="dota-share-modal-title"
        aria-modal="true"
        className={`growth-modal ${styles.modal}`}
        role="dialog"
      >
        <header className="growth-modal-header">
          <div>
            <p className={styles.eyebrow}>{t("dota.share.modalEyebrow")}</p>
            <h2 id="dota-share-modal-title">{t("dota.share.modalTitle")}</h2>
            <p className={styles.lead}>{t("dota.share.modalLead")}</p>
          </div>
          <button className="growth-modal-close" onClick={onClose} type="button">
            {t("common.close")}
          </button>
        </header>

        <div className={styles.options}>
          {SHARE_KINDS.filter((kind) => kind !== "id" || profile.dotaAccountId.trim().length > 0).map(
            (kind) => (
            <article className={styles.optionCard} key={kind}>
              <div className={styles.optionHeader}>
                <h3>{t(`dota.share.copy.${kind}` as never)}</h3>
                <button
                  className="primary-button"
                  onClick={() => void handleCopy(kind)}
                  type="button"
                >
                  {copiedKind === kind ? t("dota.share.copied") : t("dota.share.copyAction")}
                </button>
              </div>
              <p className={styles.preview}>{buildDotaShareText(kind, profile, t)}</p>
            </article>
            )
          )}
        </div>

        {error ? <FormFeedback errorMessage={error} /> : null}
      </section>
    </div>
  );
}
