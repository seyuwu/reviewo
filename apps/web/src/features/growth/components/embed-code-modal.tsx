"use client";

import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { buildEmbedCode } from "../lib/share-urls";
import { CopyLinkButton } from "./copy-link-button";

interface EmbedCodeModalProps {
  entityId: string;
  entityTitle: string;
  onClose: () => void;
}

export function EmbedCodeModal({ entityId, entityTitle, onClose }: EmbedCodeModalProps) {
  const t = useTranslation();
  const embedCode = buildEmbedCode(entityId);

  return (
    <div className="growth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="growth-modal growth-embed-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="growth-embed-title"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="growth-modal-header">
          <div>
            <p className="result-type">{entityTitle}</p>
            <h2 id="growth-embed-title">{t("growth.embed.title")}</h2>
          </div>
          <button type="button" className="growth-modal-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        <pre className="growth-embed-code">{embedCode}</pre>

        <CopyLinkButton label={t("growth.embed.copy")} successMessage={t("growth.embed.copied")} url={embedCode} />
      </div>
    </div>
  );
}

interface EmbedCodeModalTriggerProps {
  entityId: string;
  entityTitle: string;
}

export function EmbedCodeModalTrigger({ entityId, entityTitle }: EmbedCodeModalTriggerProps) {
  const t = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" className="secondary-button" onClick={() => setIsOpen(true)}>
        {t("growth.embed.button")}
      </button>
      {isOpen ? (
        <EmbedCodeModal
          entityId={entityId}
          entityTitle={entityTitle}
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
