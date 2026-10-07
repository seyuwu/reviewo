"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "../../i18n/locale-provider";
import styles from "./tournament-discord-invite.module.css";

const DISCORD_INVITE_URL = "https://discord.gg/23sQdSHYdd";
const SEEN_KEY = "fdp:tournaments-discord:v1";
const ACKNOWLEDGED_EVENT = "fdp:tournaments-discord:acknowledged";

function acknowledgeInvite() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // The open page still closes the invitation when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(ACKNOWLEDGED_EVENT));
}

function DiscordIcon({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.73 4.86a19.8 19.8 0 0 0-4.88-1.51l-.6 1.23a18.4 18.4 0 0 0-4.5 0l-.61-1.23a19.7 19.7 0 0 0-4.88 1.51C1.18 9.42.35 13.87.76 18.26a19.9 19.9 0 0 0 5.99 3.03l1.23-2.02a12.9 12.9 0 0 1-1.94-.95l.47-.36a14.2 14.2 0 0 0 11 0l.48.36c-.63.36-1.29.68-1.95.95l1.23 2.02a19.8 19.8 0 0 0 5.99-3.03c.48-5.09-.83-9.5-3.53-13.4ZM8.52 15.62c-1.17 0-2.13-1.08-2.13-2.41s.94-2.42 2.13-2.42 2.15 1.09 2.13 2.42c0 1.33-.94 2.41-2.13 2.41Zm6.96 0c-1.17 0-2.13-1.08-2.13-2.41s.94-2.42 2.13-2.42 2.15 1.09 2.13 2.42c0 1.33-.94 2.41-2.13 2.41Z" />
  </svg>;
}

export function TournamentDiscordButton() {
  const t = useTranslation();
  return <a className={styles.serverButton} href={DISCORD_INVITE_URL} target="_blank"
    rel="noopener noreferrer" onClick={acknowledgeInvite}>
    <DiscordIcon />
    {t("dota.tournaments.discord.server")}
    <span aria-hidden="true">↗</span>
  </a>;
}

export function TournamentDiscordOnboarding() {
  const t = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let seen = false;
    try { seen = window.localStorage.getItem(SEEN_KEY) === "1"; } catch { /* Show the invitation for this visit. */ }
    if (seen) return;
    const previousOverflow = document.body.style.overflow;
    const restoreScroll = () => { document.body.style.overflow = previousOverflow; };
    const close = () => { dialog.close(); restoreScroll(); };
    window.addEventListener(ACKNOWLEDGED_EVENT, close);
    dialog.addEventListener("close", restoreScroll);
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener(ACKNOWLEDGED_EVENT, close);
      dialog.removeEventListener("close", restoreScroll);
      dialog.close();
      restoreScroll();
    };
  }, []);

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="tournament-discord-title"
    aria-describedby="tournament-discord-description" onCancel={(event) => event.preventDefault()}>
    <div className={styles.content}>
      <div className={styles.logo}><DiscordIcon /></div>
      <h2 id="tournament-discord-title">{t("dota.tournaments.discord.title")}</h2>
      <p id="tournament-discord-description">{t("dota.tournaments.discord.description")}</p>
      <div className={styles.actions}>
        <a className={styles.joinButton} href={DISCORD_INVITE_URL} target="_blank"
          rel="noopener noreferrer" onClick={acknowledgeInvite}>
          <DiscordIcon />{t("dota.tournaments.discord.join")}<span aria-hidden="true">↗</span>
        </a>
        <button className={styles.confirmButton} type="button" onClick={acknowledgeInvite}>
          {t("dota.tournaments.discord.confirm")}
        </button>
      </div>
    </div>
  </dialog>;
}
