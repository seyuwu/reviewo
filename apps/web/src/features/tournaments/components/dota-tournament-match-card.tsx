"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  confirmDotaTournamentLobby,
  confirmDotaTournamentResult,
  disputeDotaTournamentMatch,
  fetchDotaTournamentMatch,
  startDotaTournamentMatch,
  submitDotaTournamentLobby,
  submitDotaTournamentResult
} from "../api/dota-tournaments-api";
import type {
  DotaTournamentMatch,
  DotaTournamentMatchSummary
} from "../types/dota-tournament";
import { formatDate } from "./dota-tournaments-view";
import styles from "./dota-tournament-match-card.module.css";

export function DotaTournamentMatchCard({
  match,
  tournamentSlug
}: {
  match: DotaTournamentMatchSummary;
  tournamentSlug: string;
}) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [details, setDetails] = useState<DotaTournamentMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [lobbyProofUrl, setLobbyProofUrl] = useState("");
  const [winnerEntryId, setWinnerEntryId] = useState(match.entryA.id);
  const [resultEvidenceUrl, setResultEvidenceUrl] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  async function updateDetails(action: () => Promise<DotaTournamentMatch>) {
    setBusy(true);
    setError(null);
    try {
      setDetails(await action());
    } catch {
      setError(t("dota.tournaments.matchAccessDenied"));
    } finally {
      setBusy(false);
    }
  }

  async function openMatch() {
    if (!authSession?.accessToken || busy) return;
    await updateDetails(() => fetchDotaTournamentMatch(tournamentSlug, match.id, authSession.accessToken));
  }

  async function submitLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !details || busy) return;
    await updateDetails(() => submitDotaTournamentLobby(
      tournamentSlug,
      match.id,
      {
        allowSpectators: details.allowSpectators,
        cheatsEnabled: details.cheatsEnabled,
        gameMode: details.gameMode,
        lobbyName: lobbyName.trim(),
        lobbyPassword: lobbyPassword.trim(),
        ...(lobbyProofUrl.trim() ? { lobbyProofUrl: lobbyProofUrl.trim() } : {}),
        serverRegion: details.serverRegion
      },
      authSession.accessToken!
    ));
  }

  async function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || busy) return;
    await updateDetails(() => submitDotaTournamentResult(
      tournamentSlug,
      match.id,
      winnerEntryId,
      resultEvidenceUrl,
      authSession.accessToken!
    ));
  }

  async function dispute() {
    if (!authSession?.accessToken || busy || !disputeReason.trim()) return;
    await updateDetails(() => disputeDotaTournamentMatch(
      tournamentSlug,
      match.id,
      disputeReason.trim(),
      authSession.accessToken!
    ));
  }

  const current = details ?? match;
  const statusLabel = t(`dota.tournaments.matchStatus.${current.status}` as never);
  const winnerName = current.winnerEntryId === current.entryA.id
    ? current.entryA.teamName
    : current.winnerEntryId === current.entryB.id
      ? current.entryB.teamName
      : null;
  const canConfirmLobby = details?.status === "LOBBY_CONFIRMATION" && details.viewerSide !== details.hostSide;
  const canConfirmResult = details?.status === "RESULT_CONFIRMATION" && details.viewerSide !== details.resultReporterSide;

  return (
    <article className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p className={styles.round}>{t("dota.tournaments.matchLabel", {
            round: String(match.roundNumber),
            number: String(match.matchNumber)
          })}</p>
          <h3>{match.entryA.teamName}<span>—</span>{match.entryB.teamName}</h3>
        </div>
        <span className={styles.status}>{statusLabel}</span>
      </div>
      <div className={styles.meta}>
        <span>{formatDate(match.scheduledAt)}</span>
        <span>{t(`dota.tournaments.mode.${match.gameMode}` as never)}</span>
        <span>{t(`dota.tournaments.region.${match.serverRegion}` as never)}</span>
        {match.allowSpectators ? <span>{t("dota.tournaments.spectatorsEnabled")}</span> : null}
        {match.streamUrl ? <a href={match.streamUrl} rel="noreferrer" target="_blank">{t("dota.tournaments.watchStream")}</a> : null}
      </div>
      {winnerName ? <strong>{t("dota.tournaments.matchWinnerLabel", { team: winnerName })}</strong> : null}
      {match.status !== "COMPLETED" && match.status !== "CANCELLED" ? (
        <p className={styles.deadline}>
          {t("dota.tournaments.matchDeadline", {
            date: formatDate(
              match.status === "LOBBY_CONFIRMATION" || match.status === "READY"
                ? match.confirmationDeadlineAt ?? match.lobbyDeadlineAt
                : match.status === "IN_PROGRESS" || match.status === "RESULT_CONFIRMATION"
                  ? match.resultDeadlineAt ?? match.lobbyDeadlineAt
                  : match.lobbyDeadlineAt
            )
          })}
        </p>
      ) : null}
      {details ? (
        <div className={styles.workflow}>
          <button className="button-secondary" disabled={busy} onClick={() => void openMatch()} type="button">
            {busy ? t("common.loadingEllipsis") : t("dota.tournaments.refreshMatch")}
          </button>
          <div className={styles.settings}>
            <strong>{t("dota.tournaments.matchSettings")}</strong>
            <span>{t(`dota.tournaments.mode.${details.gameMode}` as never)} · {t(`dota.tournaments.region.${details.serverRegion}` as never)}</span>
            <span>{t(details.allowSpectators ? "dota.tournaments.spectatorsEnabled" : "dota.tournaments.spectatorsDisabled")}</span>
            <span>{t(details.cheatsEnabled ? "dota.tournaments.cheatsEnabled" : "dota.tournaments.cheatsDisabled")}</span>
          </div>
          {details.lobbyName ? (
            <div className={styles.lobbySecret}>
              <span>{t("dota.tournaments.matchLobbyName")}: <strong>{details.lobbyName}</strong></span>
              <span>{t("dota.tournaments.matchLobbyPassword")}: <strong>{details.lobbyPassword}</strong></span>
              {details.lobbyProofUrl ? <a href={details.lobbyProofUrl} rel="noreferrer" target="_blank">{t("dota.tournaments.matchLobbyProof")}</a> : null}
            </div>
          ) : null}
          {details.resultEvidenceUrl ? <a href={details.resultEvidenceUrl} rel="noreferrer" target="_blank">{t("dota.tournaments.matchResultEvidence")}</a> : null}
          {details.disputeReason ? <p className={styles.dispute}>{details.disputeReason}</p> : null}

          {details.status === "SCHEDULED" && details.canManageLobby ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitLobby(event)}>
              <label>{t("dota.tournaments.matchLobbyName")}<input maxLength={120} onChange={(event) => setLobbyName(event.target.value)} required value={lobbyName} /></label>
              <label>{t("dota.tournaments.matchLobbyPassword")}<input maxLength={120} onChange={(event) => setLobbyPassword(event.target.value)} required value={lobbyPassword} /></label>
              <label>{t("dota.tournaments.matchLobbyProof")}<input maxLength={500} onChange={(event) => setLobbyProofUrl(event.target.value)} type="url" value={lobbyProofUrl} /></label>
              <p>{t("dota.tournaments.matchSettingsConfirmHint")}</p>
              <button className="button-primary" disabled={busy} type="submit">{busy ? t("common.loadingEllipsis") : t("dota.tournaments.matchSubmitLobby")}</button>
            </form>
          ) : null}
          {details.status === "SCHEDULED" && !details.canManageLobby ? <p>{t("dota.tournaments.matchWaitHost")}</p> : null}
          {details.status === "LOBBY_CONFIRMATION" && canConfirmLobby ? (
            <>
              <button className="button-primary" disabled={busy} onClick={() => void updateDetails(() => confirmDotaTournamentLobby(tournamentSlug, match.id, authSession!.accessToken))} type="button">{t("dota.tournaments.matchConfirmLobby")}</button>
              <DisputeForm value={disputeReason} onChange={setDisputeReason} onSubmit={() => void dispute()} disabled={busy} t={t} />
            </>
          ) : null}
          {details.status === "LOBBY_CONFIRMATION" && !canConfirmLobby ? <p>{t("dota.tournaments.matchWaitOpponent")}</p> : null}
          {details.status === "READY" && details.canManageLobby ? (
            <button className="button-primary" disabled={busy} onClick={() => void updateDetails(() => startDotaTournamentMatch(tournamentSlug, match.id, authSession!.accessToken))} type="button">{t("dota.tournaments.matchStart")}</button>
          ) : null}
          {details.status === "READY" && !details.canManageLobby ? <p>{t("dota.tournaments.matchWaitHost")}</p> : null}
          {details.status === "IN_PROGRESS" ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitResult(event)}>
              <label>{t("dota.tournaments.matchWinner")}<select onChange={(event) => setWinnerEntryId(event.target.value)} value={winnerEntryId}>
                <option value={details.entryA.id}>{details.entryA.teamName}</option>
                <option value={details.entryB.id}>{details.entryB.teamName}</option>
              </select></label>
              <label>{t("dota.tournaments.matchResultEvidence")}<input maxLength={500} onChange={(event) => setResultEvidenceUrl(event.target.value)} type="url" value={resultEvidenceUrl} /></label>
              <button className="button-primary" disabled={busy} type="submit">{t("dota.tournaments.matchSubmitResult")}</button>
            </form>
          ) : null}
          {details.status === "RESULT_CONFIRMATION" && canConfirmResult ? (
            <>
              <button className="button-primary" disabled={busy} onClick={() => void updateDetails(() => confirmDotaTournamentResult(tournamentSlug, match.id, authSession!.accessToken))} type="button">{t("dota.tournaments.matchConfirmResult")}</button>
              <DisputeForm value={disputeReason} onChange={setDisputeReason} onSubmit={() => void dispute()} disabled={busy} t={t} />
            </>
          ) : null}
          {details.status === "RESULT_CONFIRMATION" && !canConfirmResult ? <p>{t("dota.tournaments.matchWaitResult")}</p> : null}
          {details.status === "DISPUTED" ? <p>{t("dota.tournaments.matchDisputeSent")}</p> : null}
        </div>
      ) : authSession?.accessToken ? (
        <button className="button-secondary" disabled={busy} onClick={() => void openMatch()} type="button">
          {busy ? t("common.loadingEllipsis") : t("dota.tournaments.openMatch")}
        </button>
      ) : (
        <Link className="button-secondary" href="/profile">{t("dota.tournaments.matchSignIn")}</Link>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </article>
  );
}

function DisputeForm({
  value,
  onChange,
  onSubmit,
  disabled,
  t
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslation>;
}) {
  return (
    <div className={styles.disputeForm}>
      <label>{t("dota.tournaments.matchDisputeReason")}<textarea maxLength={1000} onChange={(event) => onChange(event.target.value)} rows={2} value={value} /></label>
      <button className="button-secondary" disabled={disabled || !value.trim()} onClick={onSubmit} type="button">{t("dota.tournaments.matchDispute")}</button>
    </div>
  );
}
