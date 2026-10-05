"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createAdminDotaTournamentMatch,
  fetchAdminDotaTournamentMatches,
  fetchDotaTournament,
  resolveAdminDotaTournamentMatch,
  type AdminDotaTournamentMatchInput
} from "../api/dota-tournaments-api";
import type { AdminDotaTournamentMatch, DotaTournament } from "../types/dota-tournament";
import { formatDate } from "./dota-tournaments-view";
import styles from "./admin-dota-tournaments-view.module.css";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
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
        fetchDotaTournament(slug),
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !form.entryAId || !form.entryBId || !form.scheduledAt || busy)
      return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const input: AdminDotaTournamentMatchInput = {
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

  async function resolveMatch(
    matchId: string,
    resolution: "ENTRY_A" | "ENTRY_B" | "REPLAY" | "CANCEL"
  ) {
    if (!authSession?.accessToken || busy) return;
    const note = resolutionNotes[matchId]?.trim() ?? "";
    if (!note) {
      setError(t("dota.tournaments.admin.resolveNote"));
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await resolveAdminDotaTournamentMatch(matchId, resolution, note, authSession.accessToken);
      setFeedback(t("dota.tournaments.admin.resolved"));
      await refresh(authSession.accessToken);
    } catch {
      setError(t("dota.tournaments.admin.matchesError"));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthSessionLoaded || permissionLoading) return <p>{t("common.loadingEllipsis")}</p>;
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
        <p>
          {t("dota.tournaments.bracket.autoLead")}{" "}
          <Link href={`/games/tournaments/${encodeURIComponent(tournament.slug)}`}>
            {t("dota.tournaments.bracket.show")}
          </Link>
        </p>
      ) : null}
      {tournament &&
      !tournament.automaticBracket &&
      ["REGISTRATION_CLOSED", "IN_PROGRESS"].includes(tournament.status) ? (
        <form className={styles.form} onSubmit={(event) => void handleCreate(event)}>
          <h2>{t("dota.tournaments.admin.createMatch")}</h2>
          <div className={styles.twoColumns}>
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
                {entries.map((entry) => (
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
                {entries
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
          <article className={styles.matchItem} key={match.id}>
            <div>
              <strong>
                {t("dota.tournaments.matchLabel", {
                  round: String(match.roundNumber),
                  number: String(match.matchNumber)
                })}
              </strong>
              <span>
                {match.entryA.teamName} — {match.entryB.teamName}
              </span>
              <span>
                {formatDate(match.scheduledAt)} ·{" "}
                {t(`dota.tournaments.matchStatus.${match.status}` as never)}
              </span>
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
            {match.status === "DISPUTED" ? (
              <div className={styles.resolution}>
                <label>
                  {t("dota.tournaments.admin.resolveNote")}
                  <textarea
                    maxLength={1000}
                    onChange={(event) =>
                      setResolutionNotes({ ...resolutionNotes, [match.id]: event.target.value })
                    }
                    rows={2}
                    value={resolutionNotes[match.id] ?? ""}
                  />
                </label>
                <div className={styles.resolutionActions}>
                  <button
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => void resolveMatch(match.id, "ENTRY_A")}
                    type="button"
                  >
                    {t("dota.tournaments.admin.awardA")}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => void resolveMatch(match.id, "ENTRY_B")}
                    type="button"
                  >
                    {t("dota.tournaments.admin.awardB")}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => void resolveMatch(match.id, "REPLAY")}
                    type="button"
                  >
                    {t("dota.tournaments.admin.replay")}
                  </button>
                  {!match.bracketKind || match.bracketKind === "MANUAL" ? (
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => void resolveMatch(match.id, "CANCEL")}
                      type="button"
                    >
                      {t("dota.tournaments.admin.cancelMatch")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}
