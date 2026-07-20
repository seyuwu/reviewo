"use client";

import { useEffect, useRef, useState } from "react";

import {
  buildTelegramShareUrl,
  buildVkShareUrl
} from "../../growth/lib/share-urls";
import { useTranslation } from "../../i18n/locale-provider";
import { trackDotaEvent } from "../lib/analytics";
import styles from "./party-share-wall.module.css";

interface PartyShareWallProps {
  inviteMessage: string;
  inviteUrl: string;
  onClose: () => void;
  onCopy: () => Promise<boolean>;
  open: boolean;
  slug: string;
}

export function PartyShareWall({
  inviteMessage,
  inviteUrl,
  onClose,
  onCopy,
  open,
  slug
}: PartyShareWallProps) {
  const t = useTranslation();
  const [phase, setPhase] = useState<"ready" | "copied">("ready");
  const [busy, setBusy] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase("ready");
      setBusy(false);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (!open) {
    return null;
  }

  async function handleCopy() {
    if (busy) {
      return;
    }

    setBusy(true);
    const ok = await onCopy();
    setBusy(false);

    if (!ok) {
      return;
    }

    setPhase("copied");
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 2000);
  }

  async function handleOpenDiscord() {
    trackDotaEvent("party_invite_open_discord", { slug });
    await handleCopy();
    window.open("https://discord.com/app", "_blank", "noopener,noreferrer");
  }

  const telegramHref = buildTelegramShareUrl(inviteUrl, inviteMessage);
  const vkHref = buildVkShareUrl(inviteUrl);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="party-share-title">
      <div className={styles.card}>
        <button className={styles.close} onClick={onClose} type="button">
          {t("dota.team.shareWallClose")}
        </button>

        {phase === "copied" ? (
          <div className={styles.success}>
            <span aria-hidden className={styles.check}>
              ✓
            </span>
            <h2 id="party-share-title">{t("dota.team.shareWallReady")}</h2>
            <p>{t("dota.team.shareWallSendHint")}</p>
          </div>
        ) : (
          <>
            <p className={styles.eyebrow}>{t("dota.team.shareWallEyebrow")}</p>
            <h2 id="party-share-title">{t("dota.team.shareWallTitle")}</h2>
            <p className={styles.lead}>{t("dota.team.shareWallLead")}</p>

            <button
              className={styles.primary}
              disabled={busy}
              onClick={() => void handleCopy()}
              type="button"
            >
              {busy ? t("common.loadingEllipsis") : t("dota.team.shareWallCopyInvite")}
            </button>

            <p className={styles.or}>{t("dota.team.shareWallOr")}</p>

            <div className={styles.channels}>
              <button className={styles.channelDiscord} onClick={() => void handleOpenDiscord()} type="button">
                Discord
              </button>
              <a
                className={styles.channel}
                href={telegramHref}
                onClick={() =>
                  trackDotaEvent("party_invite_share_channel", { channel: "telegram", slug })
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                Telegram
              </a>
              <a
                className={styles.channel}
                href={vkHref}
                onClick={() =>
                  trackDotaEvent("party_invite_share_channel", { channel: "vk", slug })
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                VK
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
