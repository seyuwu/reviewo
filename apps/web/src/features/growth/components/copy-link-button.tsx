"use client";

import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { copyTextToClipboard } from "../lib/share-urls";

interface CopyLinkButtonProps {
  className?: string;
  label?: string;
  onCopied?: () => void;
  successMessage?: string;
  url: string;
  wrapperClassName?: string;
}

export function CopyLinkButton({
  className = "secondary-button",
  label,
  onCopied,
  successMessage,
  url,
  wrapperClassName
}: CopyLinkButtonProps) {
  const t = useTranslation();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleCopy(): Promise<void> {
    const copied = await copyTextToClipboard(url);

    if (!copied) {
      return;
    }

    const message = successMessage ?? t("growth.share.linkCopied");
    setStatusMessage(message);
    onCopied?.();
    window.setTimeout(() => {
      setStatusMessage(null);
    }, 2200);
  }

  return (
    <div className={wrapperClassName ? `${wrapperClassName} growth-copy-link` : "growth-copy-link"}>
      <button type="button" className={className} onClick={() => void handleCopy()}>
        {label ?? t("growth.share.copyLink")}
      </button>
      {statusMessage ? <p className="growth-inline-status">{statusMessage}</p> : null}
    </div>
  );
}
