"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/locale-provider";

export function TelegramBotHandle({ handle }: { handle: string }) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setCopied(false); setFailed(false); }, [handle]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="telegram-bot-handle">
      <div className="telegram-bot-handle__row">
        <code>{handle}</code>
        <button className="button-secondary" onClick={() => void copy()} type="button">
          {t(copied ? "auth.telegram.botCopied" : "auth.telegram.copyBot")}
        </button>
      </div>
      {failed ? <p role="status">{t("auth.telegram.copyBotFailed")}</p> : null}
    </div>
  );
}
