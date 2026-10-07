"use client";
import { useRef, useState } from "react";
import type { AdminDotaTournamentMatch } from "../types/dota-tournament";
import { resolveAdminDotaTournamentMatch } from "../api/dota-tournaments-api";
import { useTranslation } from "../../i18n/locale-provider";
import styles from "./tournament-match-chat.module.css";

type Resolution = "ENTRY_A" | "ENTRY_B" | "ENTRY_A_SERIES" | "ENTRY_B_SERIES" | "REPLAY" | "CANCEL";
export function TournamentMatchResolution({ match, token, onChanged }: {
  match: AdminDotaTournamentMatch; token: string; onChanged: () => Promise<unknown>;
}) {
  const t = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lock = useRef(false);
  async function resolve(resolution: Resolution) {
    if (lock.current || !note.trim()) return;
    lock.current = true; setBusy(true); setError(false);
    try { await resolveAdminDotaTournamentMatch(match.id, resolution, note.trim(), token); await onChanged(); }
    catch { setError(true); }
    finally { lock.current = false; setBusy(false); }
  }
  if (match.status !== "DISPUTED") return null;
  const actions: Resolution[] = ["ENTRY_A", "ENTRY_B", "REPLAY"];
  if ((match.bestOf ?? 1) > 1) actions.unshift("ENTRY_A_SERIES", "ENTRY_B_SERIES");
  if (!match.bracketKind || match.bracketKind === "MANUAL") actions.push("CANCEL");
  return <section className={styles.panel}>
    <h2>{t("dota.tournaments.disputeNotificationOpen")}</h2>
    <p className={styles.reason}>{match.disputeReason}</p>
    <div className={styles.evidence}>
      {match.lobbyProofUrl ? <a href={match.lobbyProofUrl} rel="noreferrer" target="_blank">{t("dota.tournaments.matchLobbyProof")}</a> : null}
      {match.resultEvidenceUrl ? <a href={match.resultEvidenceUrl} rel="noreferrer" target="_blank">{t("dota.tournaments.matchResultEvidence")}</a> : null}
    </div>
    <label className={styles.label}>{t("dota.tournaments.admin.resolveNote")}
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} />
    </label>
    <div className={styles.actions}>
      {actions.map((value) => {
          const key = { ENTRY_A_SERIES: "awardSeriesA", ENTRY_B_SERIES: "awardSeriesB", ENTRY_A: "awardA", ENTRY_B: "awardB", REPLAY: "replay", CANCEL: "cancelMatch" }[value];
          return <button className="button-secondary" key={value} type="button" disabled={busy || !note.trim()}
            onClick={() => void resolve(value)}>{t(("dota.tournaments.admin." + key) as never)}</button>;
        })}
    </div>
    {error ? <p role="alert" className={styles.error}>{t("dota.tournaments.admin.matchesError")}</p> : null}
  </section>;
}
