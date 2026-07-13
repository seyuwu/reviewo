"use client";

import { useEffect, useState, type RefObject } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useTranslation } from "../../i18n/locale-provider";
import { copyDotaShareText } from "../lib/share";
import { hasSeenShareModal, markShareModalSeen } from "../lib/share-modal-storage";
import { trackDotaEvent } from "../lib/analytics";
import type { DotaProfile } from "../types/dota";
import { DotaShareModal } from "./dota-share-modal";
import styles from "./dota-share-panel.module.css";

interface DotaSharePanelProps {
  autoOpenModal?: boolean;
  panelRef?: RefObject<HTMLElement | null>;
  profile: DotaProfile;
}

export function DotaSharePanel({ autoOpenModal = false, panelRef, profile }: DotaSharePanelProps) {
  const t = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wasAutoOpened, setWasAutoOpened] = useState(false);
  const [copiedPrimary, setCopiedPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progressPercent = Math.min(
    100,
    (profile.progress.current / profile.progress.target) * 100
  );
  const isComplete = profile.progress.current >= profile.progress.target;

  useEffect(() => {
    if (!autoOpenModal || hasSeenShareModal(profile.slug)) {
      return;
    }

    setIsModalOpen(true);
    setWasAutoOpened(true);

    const scrollTimeout = window.setTimeout(() => {
      panelRef?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    return () => {
      window.clearTimeout(scrollTimeout);
    };
  }, [autoOpenModal, panelRef, profile.slug]);

  function handleCloseModal() {
    setIsModalOpen(false);

    if (wasAutoOpened) {
      markShareModalSeen(profile.slug);
      setWasAutoOpened(false);
    }
  }

  function handleOpenModal() {
    setIsModalOpen(true);
  }

  async function handlePrimaryCopy() {
    setError(null);
    const copied = await copyDotaShareText("profile", profile, t);

    if (!copied) {
      setError(t("dota.share.copyError"));
      return;
    }

    setCopiedPrimary(true);
    trackDotaEvent("dota_share_copied", { kind: "profile", slug: profile.slug });
    window.setTimeout(() => setCopiedPrimary(false), 2200);
  }

  return (
    <>
      <section className={styles.callout} ref={panelRef}>
        <div className={styles.topRow}>
          <div aria-label={t("dota.share.progressLabel")} className={styles.progressBadge}>
            <strong>{profile.progress.current}</strong>
            <span>/</span>
            <span>{profile.progress.target}</span>
          </div>

          <div className={styles.copyBlock}>
            <p className={styles.kicker}>{t("dota.share.kicker")}</p>
            <h2>{isComplete ? t("dota.share.complete") : t("dota.share.title")}</h2>
            <p className={styles.subtitle}>
              {isComplete
                ? t("dota.share.completeHint")
                : t("dota.share.progress", {
                    current: String(profile.progress.current),
                    target: String(profile.progress.target)
                  })}
            </p>
          </div>
        </div>

        <div aria-hidden="true" className={styles.progressBar}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <div className={styles.actions}>
          <button className={`primary-button ${styles.primaryAction}`} onClick={() => void handlePrimaryCopy()} type="button">
            {copiedPrimary ? t("dota.share.copied") : t("dota.share.primaryCta")}
          </button>
          <button className={styles.secondaryAction} onClick={handleOpenModal} type="button">
            {t("dota.share.openModal")}
          </button>
        </div>

        {error ? <FormFeedback errorMessage={error} /> : null}
      </section>

      <DotaShareModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        profile={profile}
      />
    </>
  );
}
