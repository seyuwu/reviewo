"use client";

import { FormEvent, useEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  confirmDotaTournamentLobby,
  confirmDotaTournamentResult,
  disputeDotaTournamentMatch,
  startDotaTournamentMatch,
  submitDotaTournamentLobby,
  submitDotaTournamentResult
} from "../api/dota-tournaments-api";
import type { DotaTournamentMatch, DotaTournamentMatchSummary } from "../types/dota-tournament";
import { formatDate } from "./dota-tournaments-view";
import styles from "./dota-tournament-match-card.module.css";

export function DotaTournamentMatchCard({
  match,
  tournamentSlug,
  onChanged,
  onBusyChange,
  initialDetails = null,
  participantLoading = false
}: {
  match: DotaTournamentMatchSummary;
  tournamentSlug: string;
  onChanged?: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  initialDetails?: DotaTournamentMatch | null;
  participantLoading?: boolean;
}) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [details, setDetails] = useState<DotaTournamentMatch | null>(initialDetails);
  useEffect(() => {
    setDetails(initialDetails);
  }, [initialDetails]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [lobbyProofUrl, setLobbyProofUrl] = useState("");
  const [winnerEntryId, setWinnerEntryId] = useState(match.entryA.id);
  const [resultEvidenceUrl, setResultEvidenceUrl] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [playersReady, setPlayersReady] = useState(false);
  const [serverNowMs, setServerNowMs] = useState(() => Date.parse(match.serverNow));

  async function updateDetails(action: () => Promise<DotaTournamentMatch>) {
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      setDetails(await action());
      await onChanged?.();
    } catch {
      setError(t("dota.tournaments.matchActionError"));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function submitLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !details || busy) return;
    await updateDetails(() =>
      submitDotaTournamentLobby(
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
      )
    );
  }

  async function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || busy) return;
    await updateDetails(() =>
      submitDotaTournamentResult(
        tournamentSlug,
        match.id,
        winnerEntryId,
        resultEvidenceUrl,
        authSession.accessToken!
      )
    );
  }

  async function dispute() {
    if (!authSession?.accessToken || busy || !disputeReason.trim()) return;
    await updateDetails(() =>
      disputeDotaTournamentMatch(
        tournamentSlug,
        match.id,
        disputeReason.trim(),
        authSession.accessToken!
      )
    );
  }

  const current = details ?? match;
  useEffect(() => {
    const receivedAt = performance.now();
    const serverTime = Date.parse(current.serverNow);
    const tick = () => setServerNowMs(serverTime + performance.now() - receivedAt);
    tick();
    if (current.status !== "SPECTATOR_ADMISSION") return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [current.serverNow, current.status]);
  useEffect(() => {
    setPlayersReady(false);
  }, [current.id, current.status]);
  const spectatorSeconds = current.spectatorAdmissionEndsAt
    ? Math.max(0, Math.ceil((Date.parse(current.spectatorAdmissionEndsAt) - serverNowMs) / 1000))
    : 0;
  const spectatorCountdown = `${Math.floor(spectatorSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(spectatorSeconds % 60).toString().padStart(2, "0")}`;
  const statusLabel = t(`dota.tournaments.matchStatus.${current.status}` as never);
  const winnerName =
    current.winnerEntryId === current.entryA.id
      ? current.entryA.teamName
      : current.winnerEntryId === current.entryB.id
        ? current.entryB.teamName
        : null;
  const canConfirmLobby =
    details?.status === "LOBBY_CONFIRMATION" &&
    details.canConfirmLobby &&
    !(details.viewerSide === "A" ? details.captainAReadyAt : details.captainBReadyAt);
  const canConfirmResult =
    details?.status === "RESULT_CONFIRMATION" && details.viewerSide !== details.resultReporterSide;

  return (
    <article className={styles.card} id={`tournament-match-${match.id}`}>
      <div className={styles.heading}>
        <div>
          <p className={styles.round}>
            {current.bracketKind === "BRONZE"
              ? t("dota.tournaments.bracket.bronze")
              : t("dota.tournaments.matchLabel", {
                  round: String(current.roundNumber),
                  number: String(current.matchNumber)
                })}
          </p>
          <h3>
            {current.entryA.teamName}
            <span>—</span>
            {current.entryB.teamName}
          </h3>
        </div>
        <span className={styles.status}>{statusLabel}</span>
      </div>
      <div className={styles.meta}>
        <span>{formatDate(current.scheduledAt)}</span>
        <span>{t(`dota.tournaments.mode.${current.gameMode}` as never)}</span>
        <span>{t(`dota.tournaments.region.${current.serverRegion}` as never)}</span>
        <span>
          {t(
            current.allowSpectators
              ? "dota.tournaments.spectatorsEnabled"
              : "dota.tournaments.spectatorsDisabled"
          )}
        </span>
        <span>
          {t(
            current.cheatsEnabled
              ? "dota.tournaments.cheatsEnabled"
              : "dota.tournaments.cheatsDisabled"
          )}
        </span>
        {current.streamUrl ? (
          <a href={current.streamUrl} rel="noreferrer" target="_blank">
            {t("dota.tournaments.watchStream")}
          </a>
        ) : null}
      </div>
      {winnerName ? (
        <strong>{t("dota.tournaments.matchWinnerLabel", { team: winnerName })}</strong>
      ) : null}
      {current.status === "LOBBY_CONFIRMATION" ? (
        <div className={styles.readiness}>
          <p>{t("dota.tournaments.matchReadinessTitle")}</p>
          {(["A", "B"] as const).map((side) => (
            <span key={side}>
              {side === "A" ? current.entryA.teamName : current.entryB.teamName}:{" "}
              {t(
                (side === "A" ? current.captainAReadyAt : current.captainBReadyAt)
                  ? "dota.tournaments.matchCaptainReady"
                  : "dota.tournaments.matchCaptainPending"
              )}
            </span>
          ))}
        </div>
      ) : null}
      {current.status === "SPECTATOR_ADMISSION" ? (
        <div className={styles.spectatorAdmission}>
          <div>
            <strong>{t("dota.tournaments.matchStatus.SPECTATOR_ADMISSION")}</strong>
            <p>{t("dota.tournaments.matchSpectatorHint")}</p>
          </div>
          <strong
            className={styles.countdown}
            role="timer"
            aria-label={t("dota.tournaments.matchSpectatorCountdown")}
          >
            {spectatorCountdown}
          </strong>
          {details?.canManageLobby ? <p>{t("dota.tournaments.matchSpectatorHostHint")}</p> : null}
        </div>
      ) : null}
      {current.status !== "COMPLETED" &&
      current.status !== "CANCELLED" &&
      current.status !== "SPECTATOR_ADMISSION" ? (
        <p className={styles.deadline}>
          {t("dota.tournaments.matchDeadline", {
            date: formatDate(
              current.status === "LOBBY_CONFIRMATION" || current.status === "READY"
                ? (current.confirmationDeadlineAt ?? current.lobbyDeadlineAt)
                : current.status === "IN_PROGRESS" || current.status === "RESULT_CONFIRMATION"
                  ? (current.resultDeadlineAt ?? current.lobbyDeadlineAt)
                  : current.lobbyDeadlineAt
            )
          })}
        </p>
      ) : null}
      {details && authSession?.accessToken ? (
        <div className={styles.workflow}>
          <div className={styles.settings}>
            <strong>{t("dota.tournaments.matchSettings")}</strong>
            <span>
              {t(`dota.tournaments.mode.${details.gameMode}` as never)} ·{" "}
              {t(`dota.tournaments.region.${details.serverRegion}` as never)}
            </span>
            <span>
              {t(
                details.allowSpectators
                  ? "dota.tournaments.spectatorsEnabled"
                  : "dota.tournaments.spectatorsDisabled"
              )}
            </span>
            <span>
              {t(
                details.cheatsEnabled
                  ? "dota.tournaments.cheatsEnabled"
                  : "dota.tournaments.cheatsDisabled"
              )}
            </span>
          </div>
          {details.lobbyName ? (
            <div className={styles.lobbySecret}>
              <span>
                {t("dota.tournaments.matchLobbyName")}: <strong>{details.lobbyName}</strong>
              </span>
              <span>
                {t("dota.tournaments.matchLobbyPassword")}: <strong>{details.lobbyPassword}</strong>
              </span>
              {details.lobbyProofUrl ? (
                <a href={details.lobbyProofUrl} rel="noreferrer" target="_blank">
                  {t("dota.tournaments.matchLobbyProof")}
                </a>
              ) : null}
            </div>
          ) : null}
          {details.resultEvidenceUrl ? (
            <a href={details.resultEvidenceUrl} rel="noreferrer" target="_blank">
              {t("dota.tournaments.matchResultEvidence")}
            </a>
          ) : null}
          {details.disputeReason ? <p className={styles.dispute}>{details.disputeReason}</p> : null}

          {details.status === "SCHEDULED" && details.canManageLobby ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitLobby(event)}>
              <label>
                {t("dota.tournaments.matchLobbyName")}
                <input
                  maxLength={120}
                  onChange={(event) => setLobbyName(event.target.value)}
                  required
                  value={lobbyName}
                />
              </label>
              <label>
                {t("dota.tournaments.matchLobbyPassword")}
                <input
                  maxLength={120}
                  onChange={(event) => setLobbyPassword(event.target.value)}
                  required
                  value={lobbyPassword}
                />
              </label>
              <label>
                {t("dota.tournaments.matchLobbyProof")}
                <input
                  maxLength={500}
                  onChange={(event) => setLobbyProofUrl(event.target.value)}
                  type="url"
                  value={lobbyProofUrl}
                />
              </label>
              <p>{t("dota.tournaments.matchSettingsConfirmHint")}</p>
              <button className="button-primary" disabled={busy} type="submit">
                {busy ? t("common.loadingEllipsis") : t("dota.tournaments.matchSubmitLobby")}
              </button>
            </form>
          ) : null}
          {details.status === "SCHEDULED" && !details.canManageLobby ? (
            <p>{t("dota.tournaments.matchWaitHost")}</p>
          ) : null}
          {details.status === "LOBBY_CONFIRMATION" && canConfirmLobby ? (
            <>
              <label className={styles.readyCheckbox}>
                <input
                  type="checkbox"
                  checked={playersReady}
                  disabled={busy}
                  onChange={(event) => setPlayersReady(event.target.checked)}
                />
                {t("dota.tournaments.matchPlayersReadyCheck")}
              </label>
              <button
                className="button-primary"
                disabled={busy || !playersReady}
                onClick={() =>
                  void updateDetails(() =>
                    confirmDotaTournamentLobby(tournamentSlug, match.id, authSession!.accessToken)
                  )
                }
                type="button"
              >
                {t("dota.tournaments.matchConfirmLobby")}
              </button>
            </>
          ) : null}
          {details.status === "LOBBY_CONFIRMATION" && !canConfirmLobby ? (
            <p>
              {t(
                details.canConfirmLobby
                  ? "dota.tournaments.matchWaitOpponent"
                  : "dota.tournaments.matchWaitCaptains"
              )}
            </p>
          ) : null}
          {(details.status === "READY" || details.status === "SPECTATOR_ADMISSION") &&
          details.canManageLobby ? (
            <button
              className="button-primary"
              disabled={busy || (details.status === "SPECTATOR_ADMISSION" && spectatorSeconds > 0)}
              onClick={() =>
                void updateDetails(() =>
                  startDotaTournamentMatch(tournamentSlug, match.id, authSession!.accessToken)
                )
              }
              type="button"
            >
              {details.status === "SPECTATOR_ADMISSION" && spectatorSeconds > 0
                ? t("dota.tournaments.matchStartAfterSpectators", { time: spectatorCountdown })
                : t("dota.tournaments.matchStart")}
            </button>
          ) : null}
          {details.status === "READY" && !details.canManageLobby ? (
            <p>{t("dota.tournaments.matchWaitHost")}</p>
          ) : null}
          {["LOBBY_CONFIRMATION", "SPECTATOR_ADMISSION", "READY"].includes(details.status) ? (
            <DisputeForm
              value={disputeReason}
              onChange={setDisputeReason}
              onSubmit={() => void dispute()}
              disabled={busy}
              t={t}
            />
          ) : null}
          {details.status === "IN_PROGRESS" ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitResult(event)}>
              <label>
                {t("dota.tournaments.matchWinner")}
                <select
                  onChange={(event) => setWinnerEntryId(event.target.value)}
                  value={winnerEntryId}
                >
                  <option value={details.entryA.id}>{details.entryA.teamName}</option>
                  <option value={details.entryB.id}>{details.entryB.teamName}</option>
                </select>
              </label>
              <label>
                {t("dota.tournaments.matchResultEvidence")}
                <input
                  maxLength={500}
                  onChange={(event) => setResultEvidenceUrl(event.target.value)}
                  type="url"
                  value={resultEvidenceUrl}
                />
              </label>
              <button className="button-primary" disabled={busy} type="submit">
                {t("dota.tournaments.matchSubmitResult")}
              </button>
            </form>
          ) : null}
          {details.status === "RESULT_CONFIRMATION" && canConfirmResult ? (
            <>
              <button
                className="button-primary"
                disabled={busy}
                onClick={() =>
                  void updateDetails(() =>
                    confirmDotaTournamentResult(tournamentSlug, match.id, authSession!.accessToken)
                  )
                }
                type="button"
              >
                {t("dota.tournaments.matchConfirmResult")}
              </button>
              <DisputeForm
                value={disputeReason}
                onChange={setDisputeReason}
                onSubmit={() => void dispute()}
                disabled={busy}
                t={t}
              />
            </>
          ) : null}
          {details.status === "RESULT_CONFIRMATION" && !canConfirmResult ? (
            <p>{t("dota.tournaments.matchWaitResult")}</p>
          ) : null}
          {details.status === "DISPUTED" ? <p>{t("dota.tournaments.matchDisputeSent")}</p> : null}
        </div>
      ) : participantLoading ? (
        <p>{t("common.loadingEllipsis")}</p>
      ) : null}
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
      <label>
        {t("dota.tournaments.matchDisputeReason")}
        <textarea
          maxLength={1000}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          value={value}
        />
      </label>
      <button
        className="button-secondary"
        disabled={disabled || !value.trim()}
        onClick={onSubmit}
        type="button"
      >
        {t("dota.tournaments.matchDispute")}
      </button>
    </div>
  );
}
