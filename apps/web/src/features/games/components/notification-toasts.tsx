"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import { isDiscordInviteUrl, openDiscordInvite } from "../../social/lib/discord-invite";
import { useNotificationToasts } from "../lib/use-notification-toasts";
import styles from "./notification-toasts.module.css";

export function NotificationToastsHost() {
  const t = useTranslation();
  const { dismiss, toasts } = useNotificationToasts();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className={styles.root}>
      {toasts.map((toast) => {
        const body = (
          <>
            <strong className={styles.title}>{toast.title}</strong>
            {toast.body ? <span className={styles.body}>{toast.body}</span> : null}
            {(toast.href || toast.actionEvent) && toast.ctaLabel ? (
              <span className={styles.cta}>{toast.ctaLabel}</span>
            ) : null}
          </>
        );

        return (
          <div className={styles.card} key={toast.id} role="status">
            {toast.actionEvent ? (
              <button
                className={styles.content}
                onClick={() => {
                  dismiss(toast.id);
                  window.dispatchEvent(
                    new CustomEvent(toast.actionEvent!, { detail: { tab: "requests" } })
                  );
                }}
                type="button"
              >
                {body}
              </button>
            ) : toast.href ? (
              toast.href.startsWith("http://") || toast.href.startsWith("https://") ? (
                <a
                  className={styles.content}
                  href={toast.href}
                  onClick={(event) => {
                    dismiss(toast.id);
                    if (toast.href && isDiscordInviteUrl(toast.href)) {
                      event.preventDefault();
                      openDiscordInvite(toast.href);
                    }
                  }}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {body}
                </a>
              ) : (
                <Link className={styles.content} href={toast.href} onClick={() => dismiss(toast.id)}>
                  {body}
                </Link>
              )
            ) : (
              <div className={styles.content}>{body}</div>
            )}
            <button
              aria-label={t("common.close")}
              className={styles.close}
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
