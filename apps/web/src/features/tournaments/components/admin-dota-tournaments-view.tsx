"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createAdminDotaTournament,
  fetchAdminDotaTournaments,
  updateAdminDotaTournament,
  type AdminDotaTournamentInput
} from "../api/dota-tournaments-api";
import type { DotaTournamentSummary, DotaTournamentStatus } from "../types/dota-tournament";
import { DOTA_TOURNAMENT_GAME_MODES, DOTA_TOURNAMENT_REGIONS } from "../types/tournament-settings";
import { statusLabel } from "./dota-tournaments-view";
import styles from "./admin-dota-tournaments-view.module.css";

const STATUSES: DotaTournamentStatus[] = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
];

export function AdminDotaTournamentsView({
  allowTournamentModerator = false,
  basePath = "/admin/tournaments",
  backHref = "/admin"
}: {
  allowTournamentModerator?: boolean;
  basePath?: string;
  backHref?: string;
} = {}) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [canManageTournaments, setCanManageTournaments] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [items, setItems] = useState<DotaTournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    automaticBracket: true,
    allowSpectators: false,
    cheatsEnabled: false,
    description: "",
    format: "",
    gameMode: "ALL_PICK",
    maxTeams: "",
    registrationClosesAt: "",
    rulesUrl: "",
    serverRegion: "EUROPE",
    slug: "",
    startsAt: "",
    status: "DRAFT" as DotaTournamentStatus,
    title: ""
  });

  const refresh = useCallback(async (token: string) => {
    const next = await fetchAdminDotaTournaments(token);
    setItems(next);
    setLoading(false);
  }, []);

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
        if (allowed) {
          await refresh(authSession.accessToken);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setError(t("dota.tournaments.admin.error"));
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !form.title.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const input: AdminDotaTournamentInput = {
        automaticBracket: form.automaticBracket,
        allowSpectators: form.allowSpectators,
        cheatsEnabled: form.cheatsEnabled,
        gameMode: form.gameMode,
        serverRegion: form.serverRegion,
        title: form.title.trim(),
        status: form.status,
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.format.trim() ? { format: form.format.trim() } : {}),
        ...(form.rulesUrl.trim() ? { rulesUrl: form.rulesUrl.trim() } : {}),
        ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : {}),
        ...(form.registrationClosesAt
          ? { registrationClosesAt: new Date(form.registrationClosesAt).toISOString() }
          : {}),
        ...(form.maxTeams ? { maxTeams: Number(form.maxTeams) } : {})
      };
      await createAdminDotaTournament(input, authSession.accessToken);
      setForm({
        automaticBracket: true,
        allowSpectators: false,
        cheatsEnabled: false,
        description: "",
        format: "",
        gameMode: "ALL_PICK",
        maxTeams: "",
        registrationClosesAt: "",
        rulesUrl: "",
        serverRegion: "EUROPE",
        slug: "",
        startsAt: "",
        status: "DRAFT",
        title: ""
      });
      setFeedback(t("dota.tournaments.admin.created"));
      await refresh(authSession.accessToken);
    } catch {
      setError(t("dota.tournaments.admin.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(slug: string, status: DotaTournamentStatus) {
    if (!authSession?.accessToken || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await updateAdminDotaTournament(slug, { status }, authSession.accessToken);
      setFeedback(t("dota.tournaments.admin.saved"));
      await refresh(authSession.accessToken);
    } catch {
      setError(t("dota.tournaments.admin.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthSessionLoaded || permissionLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }
  if (!canManageTournaments) {
    return (
      <section className={styles.page}>
        <h1>{t("admin.accessDeniedTitle")}</h1>
        <p>{t("admin.accessDeniedBody")}</p>
        <Link className="button-secondary" href={backHref}>
          {t("admin.backToProfile")}
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t("dota.tournaments.eyebrow")}</p>
        <h1>{t("dota.tournaments.admin.title")}</h1>
      </header>
      <FormFeedback errorMessage={error} statusMessage={feedback} />
      <form className={styles.form} onSubmit={(event) => void handleCreate(event)}>
        <h2>{t("dota.tournaments.admin.create")}</h2>
        <label>
          {t("dota.tournaments.admin.titleLabel")}
          <input
            maxLength={120}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
            value={form.title}
          />
        </label>
        <label>
          {t("dota.tournaments.admin.slugLabel")}
          <input
            maxLength={120}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
            value={form.slug}
          />
        </label>
        <div className={styles.twoColumns}>
          <label>
            {t("dota.tournaments.admin.formatLabel")}
            <input
              maxLength={80}
              onChange={(event) => setForm({ ...form, format: event.target.value })}
              placeholder="5×5 · single elimination"
              value={form.format}
            />
          </label>
          <label>
            {t("dota.tournaments.admin.gameModeLabel")}
            <select
              onChange={(event) => setForm({ ...form, gameMode: event.target.value })}
              value={form.gameMode}
            >
              {DOTA_TOURNAMENT_GAME_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`dota.tournaments.mode.${mode}` as never)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("dota.tournaments.admin.serverRegionLabel")}
            <select
              onChange={(event) => setForm({ ...form, serverRegion: event.target.value })}
              value={form.serverRegion}
            >
              {DOTA_TOURNAMENT_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {t(`dota.tournaments.region.${region}` as never)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              checked={form.automaticBracket}
              onChange={(event) => setForm({ ...form, automaticBracket: event.target.checked })}
              type="checkbox"
            />
            {t("dota.tournaments.bracket.auto")}
          </label>
          <p>{t("dota.tournaments.bracket.autoLead")}</p>
          <label className={styles.checkboxLabel}>
            <input
              checked={form.allowSpectators}
              onChange={(event) => setForm({ ...form, allowSpectators: event.target.checked })}
              type="checkbox"
            />
            {t("dota.tournaments.admin.spectatorsLabel")}
          </label>
          <label className={styles.checkboxLabel}>
            <input
              checked={form.cheatsEnabled}
              onChange={(event) => setForm({ ...form, cheatsEnabled: event.target.checked })}
              type="checkbox"
            />
            {t("dota.tournaments.admin.cheatsLabel")}
          </label>
          <label>
            {t("dota.tournaments.admin.statusLabel")}
            <select
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as DotaTournamentStatus })
              }
              value={form.status}
            >
              {STATUSES.filter(
                (status) => !form.automaticBracket || !["IN_PROGRESS", "COMPLETED"].includes(status)
              ).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status, t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("dota.tournaments.admin.startsAtLabel")}
            <input
              onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              type="datetime-local"
              value={form.startsAt}
            />
          </label>
          <label>
            {t("dota.tournaments.admin.registrationClosesAtLabel")}
            <input
              onChange={(event) => setForm({ ...form, registrationClosesAt: event.target.value })}
              type="datetime-local"
              value={form.registrationClosesAt}
            />
          </label>
          <label>
            {t("dota.tournaments.admin.maxTeamsLabel")}
            <input
              max={256}
              min={2}
              onChange={(event) => setForm({ ...form, maxTeams: event.target.value })}
              type="number"
              value={form.maxTeams}
            />
          </label>
          <label>
            {t("dota.tournaments.admin.rulesUrlLabel")}
            <input
              maxLength={500}
              onChange={(event) => setForm({ ...form, rulesUrl: event.target.value })}
              type="url"
              value={form.rulesUrl}
            />
          </label>
        </div>
        <label>
          {t("dota.tournaments.admin.descriptionLabel")}
          <textarea
            maxLength={10000}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={5}
            value={form.description}
          />
        </label>
        <button className="button-primary" disabled={busy || !form.title.trim()} type="submit">
          {busy ? t("common.loadingEllipsis") : t("dota.tournaments.admin.create")}
        </button>
      </form>

      <section className={styles.list}>
        <h2>{t("dota.tournaments.title")}</h2>
        {loading ? <p>{t("common.loadingEllipsis")}</p> : null}
        {!loading && items.length === 0 ? <p>{t("dota.tournaments.admin.empty")}</p> : null}
        {items.map((item) => (
          <article className={styles.item} key={item.id}>
            <div>
              <Link href={`/games/tournaments/${encodeURIComponent(item.slug)}`}>
                <strong>{item.title}</strong>
              </Link>
              <span>
                {item.registeredTeams} · {item.slug}
              </span>
            </div>
            <select
              disabled={busy}
              onChange={(event) =>
                void handleStatus(item.slug, event.target.value as DotaTournamentStatus)
              }
              value={item.status}
            >
              {STATUSES.filter(
                (status) => !item.bracketGeneratedAt || [item.status, "CANCELLED"].includes(status)
              )
                .filter(
                  (status) =>
                    !item.automaticBracket || item.bracketGeneratedAt || status !== "COMPLETED"
                )
                .map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status, t)}
                  </option>
                ))}
            </select>
            {item.automaticBracket &&
            !item.bracketGeneratedAt &&
            ["REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(item.status) ? (
              <button
                className="button-primary"
                type="button"
                disabled={busy || item.registeredTeams < 2}
                onClick={() => void handleStatus(item.slug, "IN_PROGRESS")}
              >
                {t("dota.tournaments.bracket.start")}
              </button>
            ) : null}
            <Link
              className="button-secondary"
              href={`${basePath}/${encodeURIComponent(item.slug)}`}
            >
              {t("dota.tournaments.admin.manageMatches")}
            </Link>
          </article>
        ))}
      </section>
    </section>
  );
}
