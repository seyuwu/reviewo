"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createAdminDotaTournamentMatch,
  fetchAdminDotaTournamentMatches,
  replaceDotaTournamentMatchSideWithReserve,
  type AdminDotaTournamentMatchInput
} from "../api/dota-tournaments-api";
import type { AdminDotaTournamentMatch, DotaTournament } from "../types/dota-tournament";
import { formatDate } from "./dota-tournaments-view";
import styles from "./admin-dota-tournaments-view.module.css";
import { fetchTournamentPlan } from "../api/tournament-plans-api";
import { DotaTournamentBracket } from "./dota-tournament-bracket";
import { TournamentMatchSettings } from "./tournament-match-settings";
import { TournamentMatchResolution } from "./tournament-match-resolution";

export function AdminDotaTournamentMatchesView({
  allowTournamentModerator = false,
  backHref = "/admin/tournaments",
  slug
}: {
  allowTournamentModerator?: boolean;
  backHref?: string;
  slug: string;
}) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [canManageTournaments, setCanManageTournaments] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [tournament, setTournament] = useState<DotaTournament | null>(null);
  const [matches, setMatches] = useState<AdminDotaTournamentMatch[]>([]);
  const scrolledMatchRef = useRef<string | null>(null);
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (!target.startsWith("tournament-match-") || scrolledMatchRef.current === target) return;
    const element = document.getElementById(target);
    if (element) {
      element.scrollIntoView({ block: "start" });
      scrolledMatchRef.current = target;
    }
  }, [matches]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reserveBusyMatchId, setReserveBusyMatchId] = useState<string | null>(null);
  const [reserveSelection, setReserveSelection] = useState<Record<string, { entryId: string; side: "A" | "B" }>>({});
  const [form, setForm] = useState({
    bestOf: 1 as 1 | 3 | 5,
    entryAId: "",
    entryBId: "",
    hostSide: "A" as "A" | "B",
    matchNumber: "1",
    roundNumber: "1",
    scheduledAt: "",
    streamUrl: ""
  });

  const refresh = useCallback(
    async (token: string) => {
      const [nextTournament, nextMatches] = await Promise.all([
        fetchTournamentPlan(slug, token),
        fetchAdminDotaTournamentMatches(slug, token)
      ]);
      setTournament(nextTournament);
      setMatches(nextMatches);
      setLoading(false);
    },
    [slug]
  );

  useEffect(() => {
    if (!isAuthSessionLoaded) return;
    if (!authSession?.accessToken) {
      router.replace("/profile");
      setPermissionLoading(false);
      return;
    }
    let active = true;
    void getCurrentUserProfile(authSession.accessToken)
      .then(async (profile) => {
        if (!active) return;
        const allowed =
          profile.role === "ADMIN" ||
          (allowTournamentModerator && profile.role === "TOURNAMENT_MODERATOR");
        setCanManageTournaments(allowed);
        if (allowed) await refresh(authSession.accessToken);
      })
      .catch(() => {
        if (active) setError(t("dota.tournaments.admin.matchesError"));
      })
      .finally(() => {
        if (active) {
          setPermissionLoading(false);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [allowTournamentModerator, authSession?.accessToken, isAuthSessionLoaded, refresh, router, t]);

  const entries = useMemo(() => tournament?.entries ?? [], [tournament]);
  const registeredEntries = useMemo(
    () => entries.filter((entry) => entry.status === "REGISTERED"),
    [entries]
  );
  const reserveEntries = useMemo(() => entries.filter((entry) => {
    if (entry.status !== "RESERVE" || entry.members.length !== 5) return false;
    const roles = entry.members.map((member) => member.positionRole);
    return ["1", "2", "3", "4", "5"].every((role) => roles.includes(role)) &&
      new Set(roles).size === 5;
  }), [entries]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !form.entryAId || !form.entryBId || !form.scheduledAt || busy)
      return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const input: AdminDotaTournamentMatchInput = {
        bestOf: form.bestOf,
        entryAId: form.entryAId,
        entryBId: form.entryBId,
        hostSide: form.hostSide,
        matchNumber: Number(form.matchNumber),
        roundNumber: Number(form.roundNumber),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        ...(form.streamUrl.trim() ? { streamUrl: form.streamUrl.trim() } : {})
      };
      await createAdminDotaTournamentMatch(slug, input, authSession.accessToken);
      setFeedback(t("dota.tournaments.admin.matchCreated"));
      setForm({ ...form, scheduledAt: "", streamUrl: "" });
      await refresh(authSession.accessToken);
    } catch {
      setError(t("dota.tournaments.admin.matchesError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceWithReserve(matchId: string) {
    const selection = reserveSelection[matchId] ?? { entryId: reserveEntries[0]?.id ?? "", side: "A" as const };
    if (!authSession?.accessToken || !selection.entryId || reserveBusyMatchId) return;
    setReserveBusyMatchId(matchId);
    setError(null);
    setFeedback(null);
    try {
      await replaceDotaTournamentMatchSideWithReserve(
        slug,
        matchId,
        selection.side,
        selection.entryId,
        authSession.accessToken
      );
      setFeedback(t("dota.tournaments.admin.reserveAssigned"));
      await refresh(authSession.accessToken);
    } catch {
      setError(t("dota.tournaments.admin.reserveError"));
    } finally {
      setReserveBusyMatchId(null);
    }
  }

  if (!isAuthSessionLoaded || permissionLoading || !authSession) return <p>{t("common.loadingEllipsis")}</p>;
  if (!canManageTournaments) {
    return (
      <section className={styles.page}>
        <h1>{t("admin.accessDeniedTitle")}</h1>
        <p>{t("admin.accessDeniedBody")}</p>
        <Link
          className="button-secondary"
          href={backHref === "/admin/tournaments" ? "/admin" : "/games/tournaments"}
        >
          {t("admin.backToProfile")}
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref}>← {t("dota.tournaments.admin.title")}</Link>
        <h1>{tournament?.title ?? t("common.loadingEllipsis")}</h1>
        <p>{t("dota.tournaments.admin.matchesTitle")}</p>
      </header>
      <FormFeedback errorMessage={error} statusMessage={feedback} />
      {tournament?.automaticBracket ? (
        <>
        <p>
          {t("dota.tournaments.bracket.autoLead")}{" "}
          <Link href={`/games/tournaments/${encodeURIComponent(tournament.slug)}`}>
            {t("dota.tournaments.bracket.show")}
          </Link>
        </p>
        <DotaTournamentBracket tournament={tournament}
          editor={{ token: authSession!.accessToken, onSaved: () => refresh(authSession!.accessToken) }} />
        </>
      ) : null}
      {tournament &&
      !tournament.automaticBracket &&
      ["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(tournament.status) ? (
        <form className={styles.form} onSubmit={(event) => void handleCreate(event)}>
          <h2>{t("dota.tournaments.admin.createMatch")}</h2>
          <div className={styles.twoColumns}>
            <label>{t("dota.tournaments.bracket.bestOf")}
              <select value={form.bestOf} onChange={(event) => setForm({ ...form, bestOf: Number(event.target.value) as 1 | 3 | 5 })}>
                {[1, 3, 5].map((value) => <option key={value} value={value}>{t(("dota.tournaments.bracket.bo" + value) as never)}</option>)}
              </select>
            </label>
            <label>
              {t("dota.tournaments.admin.roundLabel")}
              <input
                min={1}
                max={64}
                onChange={(event) => setForm({ ...form, roundNumber: event.target.value })}
                type="number"
                value={form.roundNumber}
              />
            </label>
            <label>
              {t("dota.tournaments.admin.matchNumberLabel")}
              <input
                min={1}
                max={128}
                onChange={(event) => setForm({ ...form, matchNumber: event.target.value })}
                type="number"
                value={form.matchNumber}
              />
            </label>
            <label>
              {t("dota.tournaments.admin.entryALabel")}
              <select
                onChange={(event) => setForm({ ...form, entryAId: event.target.value })}
                required
                value={form.entryAId}
              >
                <option value="">—</option>
                {registeredEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.teamName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("dota.tournaments.admin.entryBLabel")}
              <select
                onChange={(event) => setForm({ ...form, entryBId: event.target.value })}
                required
                value={form.entryBId}
              >
                <option value="">—</option>
                {registeredEntries
                  .filter((entry) => entry.id !== form.entryAId)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.teamName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("dota.tournaments.admin.scheduledAtLabel")}
              <input
                onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
                required
                type="datetime-local"
                value={form.scheduledAt}
              />
            </label>
            <label>
              {t("dota.tournaments.admin.hostSideLabel")}
              <select
                onChange={(event) =>
                  setForm({ ...form, hostSide: event.target.value as "A" | "B" })
                }
                value={form.hostSide}
              >
                <option value="A">{t("dota.tournaments.admin.entryALabel")}</option>
                <option value="B">{t("dota.tournaments.admin.entryBLabel")}</option>
              </select>
            </label>
            <label>
              {t("dota.tournaments.admin.streamUrlLabel")}
              <input
                maxLength={500}
                onChange={(event) => setForm({ ...form, streamUrl: event.target.value })}
                type="url"
                value={form.streamUrl}
              />
            </label>
          </div>
          <p>
            {t("dota.tournaments.admin.gameModeLabel")}:{" "}
            {t(`dota.tournaments.mode.${tournament.gameMode}` as never)} ·{" "}
            {t(`dota.tournaments.region.${tournament.serverRegion}` as never)}
          </p>
          <button className="button-primary" disabled={busy || entries.length < 2} type="submit">
            {busy ? t("common.loadingEllipsis") : t("dota.tournaments.admin.createMatch")}
          </button>
        </form>
      ) : null}
      <section className={styles.list}>
        <h2>{t("dota.tournaments.admin.matchesTitle")}</h2>
        {loading ? <p>{t("common.loadingEllipsis")}</p> : null}
        {!loading && matches.length === 0 ? <p>{t("dota.tournaments.matchNoMatches")}</p> : null}
        {matches.map((match) => (
          <article className={styles.matchItem} key={match.id} id={"tournament-match-" + match.id}>
            <div>
              <Link className={styles.matchTitle} href={`/games/tournaments/${encodeURIComponent(tournament?.slug ?? slug)}/matches/${match.id}`}>
                {t("dota.tournaments.matchLabel", {
                  round: String(match.roundNumber),
                  number: String(match.matchNumber)
                })}
              </Link>
              <Link className={styles.matchTitle} href={`/games/tournaments/${encodeURIComponent(tournament?.slug ?? slug)}/matches/${match.id}`}>
                {match.entryA.teamName} — {match.entryB.teamName}
              </Link>
              <span>
                {formatDate(match.scheduledAt)} ·{" "}
                {t(`dota.tournaments.matchStatus.${match.status}` as never)}
              </span>
              <span>BO{match.bestOf ?? 1} · {match.score?.A ?? 0}:{match.score?.B ?? 0}</span>
              {match.bracketKind && match.bracketKind !== "MANUAL" ? <span>{match.bracketKind}</span> : null}
              {(!match.bracketKind || match.bracketKind === "MANUAL") && authSession ? <TournamentMatchSettings
                slug={slug} matchId={match.id} token={authSession.accessToken} bestOf={match.bestOf ?? 1}
                scheduledAt={match.scheduledAt}
                canEditBestOf={!["COMPLETED", "CANCELLED", "IN_PROGRESS", "RESULT_CONFIRMATION"].includes(match.status) &&
                  !(match.gameResults ?? []).some((game) => game.startedAt || game.winnerEntryId)}
                canEditTime={["SCHEDULED", "LOBBY_CONFIRMATION", "READY", "SPECTATOR_ADMISSION", "DISPUTED"].includes(match.status) &&
                  !(match.gameResults ?? []).some((game) => game.startedAt && !game.winnerEntryId)}
                onSaved={() => refresh(authSession.accessToken)} /> : null}
              {match.lobbyName ? (
                <span>
                  {t("dota.tournaments.matchLobbyName")}: {match.lobbyName}
                </span>
              ) : null}
              {match.disputeReason ? <span>{match.disputeReason}</span> : null}
              {match.lobbyProofUrl ? (
                <a href={match.lobbyProofUrl} rel="noreferrer" target="_blank">
                  {t("dota.tournaments.matchLobbyProof")}
                </a>
              ) : null}
              {match.resultEvidenceUrl ? (
                <a href={match.resultEvidenceUrl} rel="noreferrer" target="_blank">
                  {t("dota.tournaments.matchResultEvidence")}
                </a>
              ) : null}
              {match.resolutionNote ? <span>{match.resolutionNote}</span> : null}
            </div>
            {(match.status === "SCHEDULED" ||
              (match.status === "DISPUTED" && !(match.gameResults ?? []).length)) &&
            Date.parse(match.scheduledAt) <= Date.now() &&
            reserveEntries.length > 0 ? (
              <div className={styles.reserveAssign}>
                <strong>{t("dota.tournaments.admin.reserveTitle")}</strong>
                <p>{t("dota.tournaments.admin.reserveWarning")}</p>
                <div className={styles.twoColumns}>
                  <label>
                    {t("dota.tournaments.admin.reserveSide")}
                    <select
                      value={(reserveSelection[match.id] ?? { entryId: reserveEntries[0]?.id ?? "", side: "A" }).side}
                      onChange={(event) => setReserveSelection((current) => ({
                        ...current,
                        [match.id]: {
                          entryId: current[match.id]?.entryId ?? reserveEntries[0]?.id ?? "",
                          side: event.target.value as "A" | "B"
                        }
                      }))}
                    >
                      <option value="A">{t("dota.tournaments.admin.reserveSideA")}</option>
                      <option value="B">{t("dota.tournaments.admin.reserveSideB")}</option>
                    </select>
                  </label>
                  <label>
                    {t("dota.tournaments.admin.reserveTeam")}
                    <select
                      value={reserveSelection[match.id]?.entryId ?? reserveEntries[0]?.id ?? ""}
                      onChange={(event) => setReserveSelection((current) => ({
                        ...current,
                        [match.id]: {
                          side: current[match.id]?.side ?? "A",
                          entryId: event.target.value
                        }
                      }))}
                    >
                      {reserveEntries.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.teamName}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="button-secondary"
                  disabled={reserveBusyMatchId !== null || !reserveEntries.length}
                  onClick={() => void handleReplaceWithReserve(match.id)}
                  type="button"
                >
                  {reserveBusyMatchId === match.id
                    ? t("common.loadingEllipsis")
                    : t("dota.tournaments.admin.reserveAssign")}
                </button>
              </div>
            ) : null}
            <TournamentMatchResolution match={match} token={authSession.accessToken}
              onChanged={() => refresh(authSession.accessToken)} />
          </article>
        ))}
      </section>
    </section>
  );
}
