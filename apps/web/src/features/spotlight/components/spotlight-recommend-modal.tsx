"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useTranslation } from "../../i18n/locale-provider";
import type { SpotlightSpendFormKey } from "../types/spotlight";
import { SpotlightCreditsWidget } from "./spotlight-credits-widget";

interface SpotlightRecommendModalProps {
  activeForm: SpotlightSpendFormKey;
  children: ReactNode;
  onClose: () => void;
  onFormChange: (form: SpotlightSpendFormKey) => void;
}

export function SpotlightRecommendModal({
  activeForm,
  children,
  onClose,
  onFormChange
}: SpotlightRecommendModalProps) {
  const t = useTranslation();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="growth-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="growth-modal spotlight-recommend-modal"
        role="dialog"
        aria-labelledby="spotlight-recommend-modal-title"
        aria-modal="true"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="growth-modal-header">
          <div>
            <p className="result-type">{t("web.spotlight.spendEyebrow")}</p>
            <h2 id="spotlight-recommend-modal-title">{t("web.spotlight.spendTitle")}</h2>
          </div>
          <button type="button" className="growth-modal-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        <SpotlightCreditsWidget />

        <div className="spotlight-recommend-modal-tabs" role="tablist" aria-label={t("web.spotlight.recommendSectionTitle")}>
          <button
            aria-selected={activeForm === "entity"}
            className={activeForm === "entity" ? "primary-button" : "secondary-button"}
            role="tab"
            type="button"
            onClick={() => {
              onFormChange("entity");
            }}
          >
            {t("web.spotlight.recommendCta.entity")}
          </button>
          <button
            aria-selected={activeForm === "top"}
            className={activeForm === "top" ? "primary-button" : "secondary-button"}
            role="tab"
            type="button"
            onClick={() => {
              onFormChange("top");
            }}
          >
            {t("web.spotlight.recommendCta.top")}
          </button>
          <button
            aria-selected={activeForm === "battle"}
            className={activeForm === "battle" ? "primary-button" : "secondary-button"}
            role="tab"
            type="button"
            onClick={() => {
              onFormChange("battle");
            }}
          >
            {t("web.spotlight.recommendCta.battle")}
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body
  );
}
