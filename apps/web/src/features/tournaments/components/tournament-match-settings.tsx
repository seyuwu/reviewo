"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/locale-provider";
import { saveTournamentPlan, saveTournamentMatchSettings, type TournamentMatchPlanInput, type TournamentSeriesSettings } from "../api/tournament-plans-api";
import styles from "./dota-tournament-bracket.module.css";

function inputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function TournamentMatchSettings({ slug, matchId, position, token, bestOf = 1, scheduledAt,
  canEditBestOf, canEditTime, onSaved, timeOnly = false }: {
  slug: string; matchId?: string; position?: Pick<TournamentMatchPlanInput, "bracketKind" | "roundOffset" | "matchNumber">;
  token: string; bestOf?: number; scheduledAt?: string | null; canEditBestOf: boolean; canEditTime: boolean;
  timeOnly?: boolean;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [bo, setBo] = useState(bestOf);
  const [date, setDate] = useState(inputDate(scheduledAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setBo(bestOf); setDate(inputDate(scheduledAt)); }, [bestOf, scheduledAt]);
  if (!canEditBestOf && !canEditTime) return <small className={styles.planLocked}>{t("dota.tournaments.bracket.locked")}</small>;
  return <div className={styles.planEditor}>
    <button className="button-secondary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {timeOnly
        ? t(scheduledAt ? "dota.tournaments.bracket.rescheduleTime" : "dota.tournaments.bracket.scheduleTime")
        : <>{t("dota.tournaments.bracket.bestOf")} · {t("dota.tournaments.bracket.time")}</>}
    </button>
    {open ? <form onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      const input: TournamentSeriesSettings = {
        ...(canEditBestOf && bo !== bestOf ? { bestOf: bo as 1 | 3 | 5 } : {}),
        ...(canEditTime && date !== inputDate(scheduledAt) ? { scheduledAt: date ? new Date(date).toISOString() : null } : {})
      };
      if (!Object.keys(input).length) { setSaved(true); return; }
      setBusy(true); setError(false); setSaved(false);
      void (position ? saveTournamentPlan(slug, { ...position, ...input }, token)
        : saveTournamentMatchSettings(matchId!, input, token)).then(async () => {
          await onSaved(); setSaved(true);
        }).catch(() => setError(true)).finally(() => setBusy(false));
    }}>
      {!timeOnly ? <label>{t("dota.tournaments.bracket.bestOf")}
        <select aria-label={t("dota.tournaments.bracket.bestOf")} value={bo} disabled={!canEditBestOf || busy} onChange={(event) => { setBo(Number(event.target.value)); setSaved(false); }}>
          {[1, 3, 5].map((value) => <option key={value} value={value}>{t(("dota.tournaments.bracket.bo" + value) as never)}</option>)}
        </select>
      </label> : null}
      <label>{t("dota.tournaments.bracket.time")}
        <input aria-label={t("dota.tournaments.bracket.time")} type="datetime-local" value={date} disabled={!canEditTime || busy}
          onInput={(event) => { setDate(event.currentTarget.value); setSaved(false); }}
          onChange={(event) => { setDate(event.target.value); setSaved(false); }} />
      </label>
      {!date ? <small>{t("dota.tournaments.bracket.autoTime")}</small> : null}
      <button className="button-primary" disabled={busy} type="submit">{t("dota.tournaments.bracket.save")}</button>
      {saved ? <small role="status">{t("dota.tournaments.bracket.saved")}</small> : null}
      {error ? <small role="alert">{t("dota.tournaments.bracket.error")}</small> : null}
    </form> : null}
  </div>;
}
