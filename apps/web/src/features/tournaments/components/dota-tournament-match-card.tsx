"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  confirmDotaTournamentLobby,
  confirmDotaTournamentResult,
  confirmManagedDotaTournamentStage,
  disputeDotaTournamentMatch,
  resolveAdminDotaTournamentMatch,
  startDotaTournamentMatch,
  startManagedDotaTournamentMatch,
  submitDotaTournamentMatchGameId,
  submitManagedDotaTournamentLobby,
  submitManagedDotaTournamentMatchGameId,
  submitDotaTournamentLobby,
  submitDotaTournamentResult
} from "../api/dota-tournaments-api";
import type { AdminDotaTournamentMatch, DotaTournamentMatch, DotaTournamentMatchSummary } from "../types/dota-tournament";
import { formatDate } from "./dota-tournaments-view";
import styles from "./dota-tournament-match-card.module.css";

export function DotaTournamentMatchCard({
  match,
  tournamentSlug,
  onChanged,
  onBusyChange,
  initialDetails = null,
  staffMatch = null,
  participantLoading = false
}: {
  match: DotaTournamentMatchSummary;
  tournamentSlug: string;
  onChanged?: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  initialDetails?: DotaTournamentMatch | null;
  staffMatch?: AdminDotaTournamentMatch | null;
  participantLoading?: boolean;
}) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [details, setDetails] = useState<DotaTournamentMatch | null>(initialDetails);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [lobbyProofUrl, setLobbyProofUrl] = useState("");
  const [managedGameMode, setManagedGameMode] = useState(match.gameMode);
  const [managedServerRegion, setManagedServerRegion] = useState(match.serverRegion);
  const [managedAllowSpectators, setManagedAllowSpectators] = useState(match.allowSpectators);
  const [managedCheatsEnabled, setManagedCheatsEnabled] = useState(match.cheatsEnabled);
  const [lobbyFormDirty, setLobbyFormDirty] = useState(false);
  const [winnerEntryId, setWinnerEntryId] = useState(match.entryA.id);
  const [resultEvidenceUrl, setResultEvidenceUrl] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [managerDecisionNote, setManagerDecisionNote] = useState("");
  const [dotaMatchId, setDotaMatchId] = useState("");
  const [idGameNumber, setIdGameNumber] = useState(1);
  const [copiedDotaMatchId, setCopiedDotaMatchId] = useState<string | null>(null);
  const [playersReady, setPlayersReady] = useState(false);
  const [showLobbyHostOnboarding, setShowLobbyHostOnboarding] = useState(false);
  const onboardingVisit = useRef<string | null>(null);
  const [serverNowMs, setServerNowMs] = useState(() => Date.parse(match.serverNow));
  useEffect(() => {
    setDetails(initialDetails);
  }, [initialDetails]);
  useEffect(() => {
    setShowLobbyHostOnboarding(false);
    if (
      !authSession?.userId ||
      details?.status !== "SCHEDULED" ||
      !details.canManageLobby ||
      match.canManageMatch
    ) {
      return;
    }

    const seenKey = `tournament-lobby-host-onboarding:v1:${authSession.userId}`;
    const visitKey = `${authSession.userId}:${details.id}`;
    if (onboardingVisit.current === visitKey) {
      setShowLobbyHostOnboarding(true);
      return;
    }
    try {
      if (window.localStorage.getItem(seenKey) === "1") return;
      window.localStorage.setItem(seenKey, "1");
    } catch {
      // Keep the onboarding useful for this visit when browser storage is unavailable.
    }
    onboardingVisit.current = visitKey;
    setShowLobbyHostOnboarding(true);
  }, [authSession?.userId, details?.id, details?.status, details?.canManageLobby, match.canManageMatch]);
  useEffect(() => {
    if (lobbyFormDirty) return;
    setLobbyName(staffMatch?.lobbyName ?? "");
    setLobbyPassword(staffMatch?.lobbyPassword ?? "");
    setLobbyProofUrl(staffMatch?.lobbyProofUrl ?? "");
    setManagedGameMode(staffMatch?.gameMode ?? match.gameMode);
    setManagedServerRegion(staffMatch?.serverRegion ?? match.serverRegion);
    setManagedAllowSpectators(staffMatch?.allowSpectators ?? match.allowSpectators);
    setManagedCheatsEnabled(staffMatch?.cheatsEnabled ?? match.cheatsEnabled);
  }, [staffMatch?.lobbyName, staffMatch?.lobbyPassword, staffMatch?.lobbyProofUrl,
    staffMatch?.gameMode, staffMatch?.serverRegion, staffMatch?.allowSpectators,
    staffMatch?.cheatsEnabled, match.gameMode, match.serverRegion, match.allowSpectators,
    match.cheatsEnabled, lobbyFormDirty]);

  async function updateDetails(action: () => Promise<DotaTournamentMatch>) {
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      setDetails(await action());
      await onChanged?.();
      return true;
    } catch {
      setError(t("dota.tournaments.matchActionError"));
      return false;
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function confirmManagedStage(stage: "LOBBY" | "RESULT", side: "A" | "B") {
    if (!authSession?.accessToken || busy) return;
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      await confirmManagedDotaTournamentStage(
        tournamentSlug,
        match.id,
        stage,
        side,
        authSession.accessToken
      );
      await onChanged?.();
    } catch {
      setError(t("dota.tournaments.matchActionError"));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function submitManagedLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || busy) return;
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      await submitManagedDotaTournamentLobby(tournamentSlug, match.id, {
        allowSpectators: managedAllowSpectators,
        cheatsEnabled: managedCheatsEnabled,
        gameMode: managedGameMode,
        lobbyName: lobbyName.trim(),
        lobbyPassword: lobbyPassword.trim(),
        ...(lobbyProofUrl.trim() ? { lobbyProofUrl: lobbyProofUrl.trim() } : {}),
        serverRegion: managedServerRegion
      }, authSession.accessToken);
      await onChanged?.();
      setLobbyFormDirty(false);
    } catch {
      setError(t("dota.tournaments.matchActionError"));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function runManagedAction(action: () => Promise<unknown>) {
    if (!authSession?.accessToken || busy) return;
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged?.();
    } catch {
      setError(t("dota.tournaments.matchActionError"));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function awardTechnicalForfeit(losingSide: "A" | "B") {
    if (!authSession?.accessToken || busy || !managerDecisionNote.trim()) return;
    const losingTeam = losingSide === "A" ? current.entryA.teamName : current.entryB.teamName;
    if (!window.confirm(t("dota.tournaments.matchManagerForfeitConfirm", { team: losingTeam }))) return;
    const resolution = losingSide === "A" ? "ENTRY_B_SERIES" : "ENTRY_A_SERIES";
    void runManagedAction(() => resolveAdminDotaTournamentMatch(
      match.id, resolution, managerDecisionNote.trim(), authSession.accessToken!
    ));
  }

  async function submitGameId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !details || busy || !/^\d{1,20}$/.test(dotaMatchId.trim()))
      return;
    await updateDetails(() =>
      submitDotaTournamentMatchGameId(
        tournamentSlug,
        match.id,
        dotaMatchId.trim(),
        authSession.accessToken!,
        idGameNumber
      )
    );
  }

  async function copyGameId(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedDotaMatchId(value);
      window.setTimeout(() => setCopiedDotaMatchId(null), 1500);
    } catch {
      setError(t("dota.tournaments.matchActionError"));
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
  const eligibleGames = (current.gameResults ?? []).filter((game) => !!game.startedAt &&
    (!!game.winnerEntryId || game.gameNumber === current.gameNumber &&
      ["RESULT_CONFIRMATION", "DISPUTED", "COMPLETED"].includes(current.status)));
  const idSignature = eligibleGames.map((game) => game.gameNumber + ":" + (game.dotaMatchId ?? "")).join("|");
  useEffect(() => {
    const game = eligibleGames.find((item) => item.gameNumber === idGameNumber) ?? eligibleGames.at(-1);
    if (game) { setIdGameNumber(game.gameNumber); setDotaMatchId(game.dotaMatchId ?? ""); }
  }, [idSignature, idGameNumber]);
  const games = current.gameResults?.length ? current.gameResults : current.dotaMatchId
    ? [{ gameNumber: 1, dotaMatchId: current.dotaMatchId, winnerEntryId: null }] : [];
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
    !match.canManageMatch &&
    details?.status === "LOBBY_CONFIRMATION" &&
    details.canConfirmLobby &&
    !(details.viewerSide === "A" ? details.captainAReadyAt : details.captainBReadyAt);
  const canConfirmResult =
    !match.canManageMatch &&
    details?.status === "RESULT_CONFIRMATION" && details.viewerSide !== details.resultReporterSide;
  const canManageLobbyStage = current.status === "LOBBY_CONFIRMATION" &&
    (!current.captainAReadyAt || !current.captainBReadyAt);
  const canManageResultStage = current.status === "RESULT_CONFIRMATION" &&
    !!staffMatch?.resultReporterSide;
  const canManageLobbyDetails = match.canManageMatch && staffMatch &&
    ["SCHEDULED", "LOBBY_CONFIRMATION", "READY", "SPECTATOR_ADMISSION"].includes(current.status);
  const canStartManagedMatch = match.canManageMatch && !!staffMatch?.lobbyName &&
    !!staffMatch.lobbyPassword && !!current.captainAReadyAt && !!current.captainBReadyAt &&
    ["READY", "SPECTATOR_ADMISSION"].includes(current.status);
  const canForfeitMatch = match.canManageMatch &&
    ["SCHEDULED", "LOBBY_CONFIRMATION", "READY", "SPECTATOR_ADMISSION", "IN_PROGRESS", "RESULT_CONFIRMATION"].includes(current.status);

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
        <strong>{t("dota.tournaments.seriesScore", { bestOf: String(current.bestOf ?? 1),
          a: String(current.score?.A ?? 0), b: String(current.score?.B ?? 0), game: String(current.gameNumber ?? 1) })}</strong>
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
        <strong>{t(current.technicalVictory ? "dota.tournaments.seriesTechnicalWin" : "dota.tournaments.matchWinnerLabel", { team: winnerName })}</strong>
      ) : null}
      {games.length ? (
        <section className={styles.gameIdSection} aria-label={t("dota.tournaments.matchGameIdTitle")}>
          <strong>{t("dota.tournaments.matchGameIdTitle")}</strong>
          {games.map((game) => <div className={styles.gameId} key={game.gameNumber}>
            <span>{t("dota.tournaments.seriesGame", { number: String(game.gameNumber) })}
              {game.winnerEntryId ? " · " + (game.winnerEntryId === current.entryA.id ? current.entryA.teamName : current.entryB.teamName) : ""}</span>
            <code>{game.dotaMatchId ?? "—"}</code>
            {game.dotaMatchId ? (
            <button
              className="button-secondary"
              onClick={() => void copyGameId(game.dotaMatchId!)}
              type="button"
            >
              {copiedDotaMatchId === game.dotaMatchId
                ? t("dota.tournaments.matchGameIdCopied")
                : t("dota.tournaments.matchGameIdCopy")}
            </button>
            ) : null}
          </div>)}
          <p>{t("dota.tournaments.matchGameIdReplayHint")}</p>
        </section>
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

          {details.status === "SCHEDULED" && details.canManageLobby && !match.canManageMatch ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitLobby(event)}>
              {showLobbyHostOnboarding ? (
                <div className={styles.hostOnboarding} role="status">
                  <strong>{t("dota.tournaments.matchLobbyHostFirstTimeTitle")}</strong>
                  <p>{t("dota.tournaments.matchLobbyHostFirstTimeHint")}</p>
                </div>
              ) : null}
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
              <p>{t("dota.tournaments.matchSettingsConfirmHint")}</p>
              <button className="button-primary" disabled={busy} type="submit">
                {busy ? t("common.loadingEllipsis") : t("dota.tournaments.matchSubmitLobby")}
              </button>
            </form>
          ) : null}
          {details.status === "SCHEDULED" && !details.canManageLobby && !match.canManageMatch ? (
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
          {details.status === "LOBBY_CONFIRMATION" && !canConfirmLobby && !match.canManageMatch ? (
            <p>
              {t(
                details.canConfirmLobby
                  ? "dota.tournaments.matchWaitOpponent"
                  : "dota.tournaments.matchWaitCaptains"
              )}
            </p>
          ) : null}
          {(details.status === "READY" || details.status === "SPECTATOR_ADMISSION") &&
          details.canManageLobby && !match.canManageMatch ? (
            <button
              className="button-primary"
              disabled={busy || Date.parse(details.scheduledAt) > serverNowMs || (details.status === "SPECTATOR_ADMISSION" && spectatorSeconds > 0)}
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
          {["READY", "SPECTATOR_ADMISSION"].includes(details.status) && Date.parse(details.scheduledAt) > serverNowMs ?
            <p>{t("dota.tournaments.seriesNotBefore", { time: formatDate(details.scheduledAt) })}</p> : null}
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
          {details.status === "IN_PROGRESS" && !match.canManageMatch ? (
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
          {details.status === "RESULT_CONFIRMATION" && !canConfirmResult && !match.canManageMatch ? (
            <p>{t("dota.tournaments.matchWaitResult")}</p>
          ) : null}
          {details.status === "DISPUTED" ? <p>{t("dota.tournaments.matchDisputeSent")}</p> : null}
          {details.canSubmitMatchGameId && !match.canManageMatch ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitGameId(event)}>
              {eligibleGames.length > 1 ? <label>{t("dota.tournaments.matchGameIdTitle")}
                <select value={idGameNumber} onChange={(event) => setIdGameNumber(Number(event.target.value))}>
                  {eligibleGames.map((game) => <option key={game.gameNumber} value={game.gameNumber}>
                    {t("dota.tournaments.seriesGame", { number: String(game.gameNumber) })}</option>)}
                </select>
              </label> : null}
              <label>
                {t("dota.tournaments.matchGameIdLabel")}
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={20}
                  onChange={(event) => setDotaMatchId(event.target.value)}
                  pattern="[0-9]{1,20}"
                  required
                  value={dotaMatchId}
                />
              </label>
              <p>{t("dota.tournaments.matchGameIdCaptainHint")}</p>
              <button
                className="button-primary"
                disabled={busy || !/^\d{1,20}$/.test(dotaMatchId.trim())}
                type="submit"
              >
                {busy ? t("common.loadingEllipsis") : t("dota.tournaments.matchGameIdSave")}
              </button>
            </form>
          ) : null}
        </div>
      ) : participantLoading ? (
        <p>{t("common.loadingEllipsis")}</p>
      ) : null}
      {match.canManageMatch && staffMatch && authSession?.accessToken &&
      (canManageLobbyDetails || canManageLobbyStage || canStartManagedMatch ||
        current.status === "IN_PROGRESS" || current.status === "RESULT_CONFIRMATION" || eligibleGames.length > 0) ? (
        <section className={styles.managerStage}>
          {canManageLobbyDetails ? (
            <form className={styles.actionForm} onSubmit={(event) => void submitManagedLobby(event)}>
              <label>
                {t("dota.tournaments.matchLobbyName")}
                <input maxLength={120} onChange={(event) => { setLobbyName(event.target.value); setLobbyFormDirty(true); }} required value={lobbyName} />
              </label>
              <label>
                {t("dota.tournaments.matchLobbyPassword")}
                <input maxLength={120} onChange={(event) => { setLobbyPassword(event.target.value); setLobbyFormDirty(true); }} required value={lobbyPassword} />
              </label>
              <label>
                {t("dota.tournaments.matchGameMode")}
                <select value={managedGameMode} onChange={(event) => { setManagedGameMode(event.target.value); setLobbyFormDirty(true); }}>
                  {["ALL_PICK", "RANDOM_DRAFT", "CAPTAINS_MODE", "CAPTAINS_DRAFT", "SINGLE_DRAFT"].map((mode) =>
                    <option key={mode} value={mode}>{t(`dota.tournaments.mode.${mode}` as never)}</option>)}
                </select>
              </label>
              <label>
                {t("dota.tournaments.matchRegion")}
                <select value={managedServerRegion} onChange={(event) => { setManagedServerRegion(event.target.value); setLobbyFormDirty(true); }}>
                  {["EUROPE", "RUSSIA", "US_EAST", "US_WEST", "SOUTH_AMERICA", "SOUTHEAST_ASIA", "CHINA", "AUSTRALIA", "SOUTH_AFRICA"].map((region) =>
                    <option key={region} value={region}>{t(`dota.tournaments.region.${region}` as never)}</option>)}
                </select>
              </label>
              <label className={styles.managerToggle}>
                <input checked={managedAllowSpectators} onChange={(event) => { setManagedAllowSpectators(event.target.checked); setLobbyFormDirty(true); }} type="checkbox" />
                {t("dota.tournaments.matchAllowSpectators")}
              </label>
              <label className={styles.managerToggle}>
                <input checked={managedCheatsEnabled} onChange={(event) => { setManagedCheatsEnabled(event.target.checked); setLobbyFormDirty(true); }} type="checkbox" />
                {t("dota.tournaments.matchCheatsEnabled")}
              </label>
              <button className="button-primary" disabled={busy || !lobbyFormDirty || !lobbyName.trim() || !lobbyPassword.trim()} type="submit">
                {busy ? t("common.loadingEllipsis") : t("dota.tournaments.matchManagerSaveLobby")}
              </button>
            </form>
          ) : null}
          {canManageLobbyStage ? (
            <div className={styles.managerStageActions}>
              {(["A", "B"] as const).map((side) => {
                const readyAt = side === "A" ? current.captainAReadyAt : current.captainBReadyAt;
                const teamName = side === "A" ? current.entryA.teamName : current.entryB.teamName;
                return readyAt ? null : (
                  <button
                    className="button-secondary"
                    disabled={busy}
                    key={side}
                    onClick={() => void confirmManagedStage("LOBBY", side)}
                    type="button"
                  >
                    {t("dota.tournaments.matchManagerConfirmLobbyFor", { team: teamName })}
                  </button>
                );
              })}
            </div>
          ) : null}
          {canManageResultStage && staffMatch.resultReporterSide ? (() => {
            const side = staffMatch.resultReporterSide === "A" ? "B" : "A";
            const teamName = side === "A" ? current.entryA.teamName : current.entryB.teamName;
            return (
              <div className={styles.managerStageActions}>
                <button
                  className="button-primary"
                  disabled={busy}
                  onClick={() => void confirmManagedStage("RESULT", side)}
                  type="button"
                >
                  {t("dota.tournaments.matchManagerConfirmResultFor", { team: teamName })}
                </button>
              </div>
            );
          })() : null}
          {canStartManagedMatch ? (
            <button className="button-primary" disabled={busy} onClick={() => void runManagedAction(() =>
              startManagedDotaTournamentMatch(tournamentSlug, match.id, authSession.accessToken!))} type="button">
              {t("dota.tournaments.matchStart")}
            </button>
          ) : null}
          {canForfeitMatch ? (
            <div className={styles.managerResult}>
              <strong>{t("dota.tournaments.matchManagerForfeitTitle")}</strong>
              <p>{t("dota.tournaments.matchManagerForfeitHint")}</p>
              <label>
                {t("dota.tournaments.matchManagerDecisionNote")}
                <textarea maxLength={1000} onChange={(event) => setManagerDecisionNote(event.target.value)} rows={2} value={managerDecisionNote} />
              </label>
              <div className={styles.managerStageActions}>
                {(["A", "B"] as const).map((losingSide) => {
                  const teamName = losingSide === "A" ? current.entryA.teamName : current.entryB.teamName;
                  return <button className="button-secondary" disabled={busy || !managerDecisionNote.trim()} key={losingSide}
                    onClick={() => awardTechnicalForfeit(losingSide)} type="button">
                    {t("dota.tournaments.matchManagerForfeitFor", { team: teamName })}
                  </button>;
                })}
              </div>
            </div>
          ) : null}
          {match.canManageMatch && ["IN_PROGRESS", "RESULT_CONFIRMATION"].includes(current.status) ? (
            <div className={styles.managerResult}>
              <label>
                {t("dota.tournaments.matchManagerDecisionNote")}
                <textarea maxLength={1000} onChange={(event) => setManagerDecisionNote(event.target.value)} rows={2} value={managerDecisionNote} />
              </label>
              <div className={styles.managerStageActions}>
                {(["A", "B"] as const).map((side) => {
                  const teamName = side === "A" ? current.entryA.teamName : current.entryB.teamName;
                  return <button className="button-secondary" disabled={busy || !managerDecisionNote.trim()} key={side}
                    onClick={() => void runManagedAction(() => resolveAdminDotaTournamentMatch(
                      match.id, side === "A" ? "ENTRY_A" : "ENTRY_B", managerDecisionNote.trim(), authSession.accessToken!))} type="button">
                    {t("dota.tournaments.matchManagerAwardGameFor", { team: teamName })}
                  </button>;
                })}
              </div>
            </div>
          ) : null}
          {match.canManageMatch && eligibleGames.length > 0 ? (
            <form className={styles.actionForm} onSubmit={(event) => {
              event.preventDefault();
              if (!authSession?.accessToken || !/^\d{1,20}$/.test(dotaMatchId.trim())) return;
              void runManagedAction(() => submitManagedDotaTournamentMatchGameId(
                tournamentSlug, match.id, dotaMatchId.trim(), authSession.accessToken!, idGameNumber));
            }}>
              {eligibleGames.length > 1 ? <label>{t("dota.tournaments.matchGameIdTitle")}
                <select value={idGameNumber} onChange={(event) => setIdGameNumber(Number(event.target.value))}>
                  {eligibleGames.map((game) => <option key={game.gameNumber} value={game.gameNumber}>
                    {t("dota.tournaments.seriesGame", { number: String(game.gameNumber) })}</option>)}
                </select>
              </label> : null}
              <label>{t("dota.tournaments.matchGameIdLabel")}
                <input autoComplete="off" inputMode="numeric" maxLength={20} onChange={(event) => setDotaMatchId(event.target.value)} pattern="[0-9]{1,20}" required value={dotaMatchId} />
              </label>
              <button className="button-secondary" disabled={busy || !/^\d{1,20}$/.test(dotaMatchId.trim())} type="submit">
                {t("dota.tournaments.matchGameIdSave")}
              </button>
            </form>
          ) : null}
        </section>
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
