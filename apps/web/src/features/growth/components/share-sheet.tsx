"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import {
  buildEntityOgImageUrl,
  buildEntityShareUrl,
  downloadImageFromUrl
} from "../lib/share-urls";
import { formatScoreOneDecimal, formatStarRating, formatTrustPercent } from "../lib/format-growth-stats";
import { CopyLinkButton } from "./copy-link-button";
import { SocialShareButtons } from "./social-share-buttons";

interface ShareSheetProps {
  avgScore: number;
  entityId: string;
  entityTitle: string;
  onClose: () => void;
  reviewsCount: number;
  trustConfidence: number;
}

export function ShareSheet({
  avgScore,
  entityId,
  entityTitle,
  onClose,
  reviewsCount,
  trustConfidence
}: ShareSheetProps) {
  const t = useTranslation();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const shareUrl = buildEntityShareUrl(entityId);
  const imageUrl = buildEntityOgImageUrl(entityId);
  const shareText = `${entityTitle} · ${formatScoreOneDecimal(avgScore)}/5`;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function handleDownloadImage(): Promise<void> {
    try {
      await downloadImageFromUrl(imageUrl, `opinia-${entityId}.png`);
      setStatusMessage(t("growth.share.imageDownloaded"));
    } catch {
      setStatusMessage(t("growth.battle.error"));
    }
  }

  return (
    <div className="growth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="growth-modal growth-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="growth-share-title"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="growth-modal-header">
          <h2 id="growth-share-title">{t("growth.share.title")}</h2>
          <button type="button" className="growth-modal-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        <div className="growth-share-preview" aria-label={t("growth.share.previewAlt")}>
          <p className="growth-share-preview-title">{entityTitle}</p>
          <p className="growth-share-preview-rating">
            <span aria-hidden="true">{formatStarRating(avgScore)}</span>
            <strong>{formatScoreOneDecimal(avgScore)}/5</strong>
          </p>
          <p className="growth-share-preview-meta">
            {t("growth.share.cardTrust", {
              percent: String(Math.round(trustConfidence * 100))
            })}
          </p>
          <p className="growth-share-preview-meta">
            {t("growth.share.cardReviews", { count: String(reviewsCount) })}
          </p>
          <p className="growth-share-preview-brand">opinia.ru</p>
        </div>

        <img
          className="growth-share-preview-image sr-only"
          src={imageUrl}
          alt={t("growth.share.previewAlt")}
        />

        <div className="growth-share-actions">
          <CopyLinkButton url={shareUrl} />
          <button type="button" className="secondary-button" onClick={() => void handleDownloadImage()}>
            {t("growth.share.downloadImage")}
          </button>
        </div>

        <SocialShareButtons pageUrl={shareUrl} text={shareText} />

        {statusMessage ? <p className="growth-inline-status">{statusMessage}</p> : null}
      </div>
    </div>
  );
}
