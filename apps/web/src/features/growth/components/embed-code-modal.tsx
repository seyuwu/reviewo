"use client";

import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import {
  capturePopoverAnchor,
  serializePopoverAnchor,
  type PopoverAnchor
} from "../lib/anchored-popover-style";
import { buildEmbedCode } from "../lib/share-urls";
import { AnchoredPopover } from "./anchored-popover";
import { CopyLinkButton } from "./copy-link-button";

interface EmbedCodeModalProps {
  anchor: PopoverAnchor;
  entityId: string;
  entityTitle: string;
  onClose: () => void;
}

export function EmbedCodeModal({ anchor, entityId, entityTitle, onClose }: EmbedCodeModalProps) {
  const t = useTranslation();
  const embedCode = buildEmbedCode(entityId);

  return (
    <AnchoredPopover
      anchor={anchor}
      ariaLabelledBy="growth-embed-title"
      className="growth-modal growth-embed-modal"
      estimatedHeight={320}
      width={360}
      onClose={onClose}
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
    </AnchoredPopover>
  );
}

interface EmbedCodeModalTriggerProps {
  className?: string;
  entityId: string;
  entityTitle: string;
}

export function EmbedCodeModalTrigger({ className, entityId, entityTitle }: EmbedCodeModalTriggerProps) {
  const t = useTranslation();
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);

  return (
    <>
      <button
        type="button"
        className={className ?? "secondary-button"}
        onClick={(event) => {
          setAnchor(serializePopoverAnchor(capturePopoverAnchor(event.nativeEvent)));
        }}
      >
        {t("growth.embed.button")}
      </button>
      {anchor ? (
        <EmbedCodeModal
          anchor={anchor}
          entityId={entityId}
          entityTitle={entityTitle}
          onClose={() => {
            setAnchor(null);
          }}
        />
      ) : null}
    </>
  );
}
