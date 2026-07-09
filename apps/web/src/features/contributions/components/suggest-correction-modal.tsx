"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./entity-contributions-section.module.css";

interface SuggestCorrectionModalProps {
  children: ReactNode;
  fieldLabel: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitDisabled: boolean;
  title: string;
}

export function SuggestCorrectionModal({
  children,
  fieldLabel,
  isSubmitting,
  onClose,
  onSubmit,
  submitDisabled,
  title
}: SuggestCorrectionModalProps) {
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
      <form
        className={`growth-modal ${styles.correctionModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-correction-title"
        onSubmit={onSubmit}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="growth-modal-header">
          <div>
            <h2 id="suggest-correction-title">{title}</h2>
            <p className="muted-copy">{fieldLabel}</p>
          </div>
          <button type="button" className="growth-modal-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        {children}

        <div className={styles.modalActions}>
          <button type="button" className="secondary-button" onClick={onClose}>
            {t("common.close")}
          </button>
          <button
            type="submit"
            className="primary-button primary-button-stable-label"
            disabled={submitDisabled || isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? t("contributions.submitting") : t("contributions.submit")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
