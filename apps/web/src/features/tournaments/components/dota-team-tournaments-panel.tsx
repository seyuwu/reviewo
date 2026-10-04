"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getGamesTournamentsUrl } from "../../../lib/config/product-hosts";
import {
  decideDotaTournamentJoinRequest,
  fetchDotaTeamTournamentEntries,
  fetchDotaTournaments,
  registerDotaTeamForTournament,
  setDotaTournamentEntryJoinMode,
  withdrawDotaTeamFromTournament
} from "../api/dota-tournaments-api";
import type { DotaTournamentSummary, DotaTournamentTeamEntry } from "../types/dota-tournament";
import styles from "./dota-team-tournaments-panel.module.css";

export function DotaTeamTournamentsPanel({
  registrationFailed = false,
  teamSlug
}: {
  registrationFailed?: boolean;
  teamSlug: string;
}) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [tournaments, setTournaments] = useState<DotaTournamentSummary[]>([]);
  const [entries, setEntries] = useState<DotaTournamentTeamEntry[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authSession?.accessToken) {
      setLoading(false);
      return;
    }
    try {
      const [nextTournaments, nextEntries] = await Promise.all([
        fetchDotaTournaments(),
        fetchDotaTeamTournamentEntries(teamSlug, authSession.accessToken)
      ]);
      setTournaments(nextTournaments);
      setEntries(nextEntries);
    } catch {
      setError(t("dota.tournaments.teamLoadError"));
    } finally {
      setLoading(false);
    }
  }, [authSession?.accessToken, t, teamSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (registrationFailed) {
      setError(t("dota.tournaments.teamCreatedRegistrationFailed"));
    }
  }, [registrationFailed, t]);

  const openTournaments = useMemo(
    () =>
      tournaments.filter(
        (tournament) =>
          tournament.status === "REGISTRATION_OPEN" &&
          (!tournament.registrationClosesAt ||
            new Date(tournament.registrationClosesAt).getTime() > Date.now()) &&
          !entries.some(
            (entry) =>
              entry.tournament.slug === tournament.slug && entry.status === "REGISTERED"
          )
      ),
    [entries, tournaments]
  );

  useEffect(() => {
    if (!openTournaments.some((tournament) => tournament.slug === selectedSlug)) {
      setSelectedSlug(openTournaments[0]?.slug ?? "");
    }
  }, [openTournaments, selectedSlug]);

  async function handleRegister() {
    if (!authSession?.accessToken || !selectedSlug || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await registerDotaTeamForTournament(
        selectedSlug,
        teamSlug,
        authSession.accessToken,
        "CONFIRM"
      );
      setFeedback(t("dota.tournaments.teamRegistered"));
      await refresh();
    } catch {
      setError(t("dota.tournaments.teamRegisterError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinMode(entry: DotaTournamentTeamEntry, joinMode: "OPEN" | "CONFIRM") {
    if (!authSession?.accessToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setDotaTournamentEntryJoinMode(
        entry.tournament.slug,
        entry.entryId,
        joinMode,
        authSession.accessToken
      );
      await refresh();
    } catch {
      setError(t("dota.tournaments.teamRegisterError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw(entry: DotaTournamentTeamEntry) {
    if (!authSession?.accessToken || busy) return;
    if (!window.confirm(t("dota.tournaments.withdrawTeamConfirm", { title: entry.tournament.title }))) {
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await withdrawDotaTeamFromTournament(
        entry.tournament.slug,
        entry.entryId,
        authSession.accessToken
      );
      setFeedback(t("dota.tournaments.teamWithdrawn", { title: entry.tournament.title }));
      await refresh();
    } catch {
      setError(t("dota.tournaments.teamRegisterError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest(entry: DotaTournamentTeamEntry, requestId: string, decision: "ACCEPT" | "DECLINE") {
    if (!authSession?.accessToken || busyRequestId) return;
    setBusyRequestId(requestId);
    setError(null);
    try {
      await decideDotaTournamentJoinRequest(
        entry.tournament.slug,
        entry.entryId,
        requestId,
        decision,
        authSession.accessToken
      );
      await refresh();
    } catch {
      setError(t("dota.tournaments.teamRegisterError"));
    } finally {
      setBusyRequestId(null);
    }
  }

  const activeEntries = entries.filter((entry) => entry.status === "REGISTERED");

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{t("dota.tournaments.eyebrow")}</p>
          <h2>{t("dota.tournaments.teamPanelTitle")}</h2>
        </div>
        <Link className="button-secondary" href={getGamesTournamentsUrl()}>
          {t("dota.tournaments.allTournaments")}
        </Link>
      </div>

      {loading ? <p className={styles.muted}>{t("common.loadingEllipsis")}</p> : null}
      {!loading && activeEntries.length > 0 ? (
        <ul className={styles.entries}>
          {activeEntries.map((entry) => (
            <li key={entry.entryId}>
              <div className={styles.entryRow}>
                <Link href={`/games/tournaments/${encodeURIComponent(entry.tournament.slug)}`}>
                  <strong>{entry.tournament.title}</strong>
                  <span>
                    {entry.tournament.status === "REGISTRATION_OPEN"
                      ? t("dota.tournaments.registrationOpen")
                      : t("dota.tournaments.registered")}
                    {` · ${t("dota.tournaments.rosterCount", {
                      current: String(entry.members.length),
                      max: "5"
                    })}`}
                  </span>
                </Link>
                {entry.tournament.status === "REGISTRATION_OPEN" ? (
                  <label className={styles.modeSelect}>
                    <span>{t("dota.tournaments.teamJoinMode")}</span>
                    <select
                      disabled={busy}
                      onChange={(event) =>
                        void handleJoinMode(entry, event.target.value as "OPEN" | "CONFIRM")
                      }
                      value={entry.joinMode}
                    >
                      <option value="OPEN">{t("dota.tournaments.openJoin")}</option>
                      <option value="CONFIRM">{t("dota.tournaments.requestJoin")}</option>
                    </select>
                  </label>
                ) : null}
                {["REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(entry.tournament.status) ? (
                  <button
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => void handleWithdraw(entry)}
                    type="button"
                  >
                    {busy ? t("common.loadingEllipsis") : t("dota.tournaments.withdrawTeam")}
                  </button>
                ) : null}
              </div>
              {entry.requests.length > 0 ? (
                <ul className={styles.requests}>
                  {entry.requests.map((request) => (
                    <li key={request.id}>
                      <span>
                        {request.displayName} · {request.positionRole} · {request.mmr ?? "—"} MMR
                      </span>
                      <div>
                        <button
                          className="button-primary"
                          disabled={busyRequestId !== null || entry.tournament.status !== "REGISTRATION_OPEN"}
                          onClick={() => void handleRequest(entry, request.id, "ACCEPT")}
                          type="button"
                        >
                          {t("dota.tournaments.acceptRequest")}
                        </button>
                        <button
                          className="button-secondary"
                          disabled={busyRequestId !== null || entry.tournament.status !== "REGISTRATION_OPEN"}
                          onClick={() => void handleRequest(entry, request.id, "DECLINE")}
                          type="button"
                        >
                          {t("dota.tournaments.declineRequest")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && openTournaments.length > 0 ? (
        <div className={styles.registerRow}>
          <label>
            <span>{t("dota.tournaments.chooseTournament")}</span>
            <select
              onChange={(event) => setSelectedSlug(event.target.value)}
              value={selectedSlug}
            >
              {openTournaments.map((tournament) => (
                <option key={tournament.slug} value={tournament.slug}>
                  {tournament.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button-primary"
            disabled={!selectedSlug || busy}
            onClick={() => void handleRegister()}
            type="button"
          >
            {busy ? t("common.loadingEllipsis") : t("dota.tournaments.registerTeam")}
          </button>
        </div>
      ) : null}

      {!loading && activeEntries.length === 0 && openTournaments.length === 0 ? (
        <p className={styles.muted}>{t("dota.tournaments.noOpenTournaments")}</p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
    </section>
  );
}
