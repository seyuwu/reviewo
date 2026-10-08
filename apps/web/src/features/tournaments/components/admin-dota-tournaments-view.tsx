"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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

type TournamentAdminForm = {
  automaticBracket: boolean;
  bracketFormat: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  allowSpectators: boolean;
  cheatsEnabled: boolean;
  description: string;
  format: string;
  gameMode: string;
  maxTeams: string;
  registrationClosesAt: string;
  rulesUrl: string;
  sponsors: Array<{ name: string; url: string; logoUrl: string }>;
  serverRegion: string;
  slug: string;
  startsAt: string;
  status: DotaTournamentStatus;
  title: string;
};

const EMPTY_TOURNAMENT_FORM: TournamentAdminForm = {
  automaticBracket: true,
  bracketFormat: "SINGLE_ELIMINATION",
  allowSpectators: false,
  cheatsEnabled: false,
  description: "",
  format: "",
  gameMode: "ALL_PICK",
  maxTeams: "",
  registrationClosesAt: "",
  rulesUrl: "",
  sponsors: [],
  serverRegion: "EUROPE",
  slug: "",
  startsAt: "",
  status: "DRAFT",
  title: ""
};

function dateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function tournamentToForm(item: DotaTournamentSummary): TournamentAdminForm {
  return {
    automaticBracket: item.automaticBracket ?? true,
    bracketFormat: item.bracketFormat ?? "SINGLE_ELIMINATION",
    allowSpectators: item.allowSpectators,
    cheatsEnabled: item.cheatsEnabled,
    description: item.description,
    format: item.format ?? "",
    gameMode: item.gameMode,
    maxTeams: item.maxTeams === null ? "" : String(item.maxTeams),
    registrationClosesAt: dateTimeInput(item.registrationClosesAt),
    rulesUrl: item.rulesUrl ?? "",
    sponsors: item.sponsors.map((sponsor) => ({
      name: sponsor.name,
      url: sponsor.url,
      logoUrl: sponsor.logoUrl ?? ""
    })),
    serverRegion: item.serverRegion,
    slug: item.slug,
    startsAt: dateTimeInput(item.startsAt),
    status: item.status,
    title: item.title
  };
}

function canEditTournament(item: DotaTournamentSummary): boolean {
  return (
    !item.bracketGeneratedAt &&
    ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(item.status)
  );
}

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
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<TournamentAdminForm>(EMPTY_TOURNAMENT_FORM);
  const formRef = useRef<HTMLFormElement>(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !form.title.trim() || busy) return;
    const editingTournament = editingSlug
      ? items.find((item) => item.slug === editingSlug)
      : null;
    if (
      editingTournament &&
      form.maxTeams &&
      Number(form.maxTeams) < editingTournament.registeredTeams
    ) {
      setError(
        t("dota.tournaments.admin.maxTeamsBelowRegistered", {
          count: String(editingTournament.registeredTeams)
        })
      );
      return;
    }
    const configuredSponsors = form.sponsors.filter(
      (sponsor) => sponsor.name.trim() || sponsor.url.trim() || sponsor.logoUrl.trim()
    );
    if (configuredSponsors.some((sponsor) => !sponsor.name.trim() || !sponsor.url.trim())) {
      setError(t("dota.tournaments.admin.sponsorFieldsRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const input: AdminDotaTournamentInput = {
        automaticBracket: form.automaticBracket,
        bracketFormat: form.automaticBracket ? form.bracketFormat : "SINGLE_ELIMINATION",
        allowSpectators: form.allowSpectators,
        cheatsEnabled: form.cheatsEnabled,
        description: form.description.trim(),
        format: form.format.trim() || null,
        gameMode: form.gameMode,
        maxTeams: form.maxTeams ? Number(form.maxTeams) : null,
        registrationClosesAt: form.registrationClosesAt
          ? new Date(form.registrationClosesAt).toISOString()
          : null,
        rulesUrl: form.rulesUrl.trim() || null,
        sponsors: configuredSponsors.map((sponsor) => ({
          name: sponsor.name.trim(),
          url: sponsor.url.trim(),
          logoUrl: sponsor.logoUrl.trim() || null
        })),
        serverRegion: form.serverRegion,
        slug: form.slug.trim() || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        title: form.title.trim(),
        status: form.status
      };
      if (editingSlug) {
        await updateAdminDotaTournament(editingSlug, input, authSession.accessToken);
      } else {
        await createAdminDotaTournament(input, authSession.accessToken);
      }
      setEditingSlug(null);
      setForm(EMPTY_TOURNAMENT_FORM);
      setFeedback(
        t(editingSlug ? "dota.tournaments.admin.tournamentUpdated" : "dota.tournaments.admin.created")
      );
      await refresh(authSession.accessToken);
    } catch {
      setError(t("dota.tournaments.admin.error"));
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(item: DotaTournamentSummary) {
    if (!canEditTournament(item) || busy) return;
    setEditingSlug(item.slug);
    setForm(tournamentToForm(item));
    setError(null);
    setFeedback(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingSlug(null);
    setForm(EMPTY_TOURNAMENT_FORM);
    setError(null);
    setFeedback(null);
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
      <form ref={formRef} className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <h2>
          {t(editingSlug ? "dota.tournaments.admin.editTournament" : "dota.tournaments.admin.create")}
        </h2>
        {editingSlug ? (
          <p className="muted-copy">
            {t("dota.tournaments.admin.editHint", {
              count: String(items.find((item) => item.slug === editingSlug)?.registeredTeams ?? 0)
            })}
          </p>
        ) : null}
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
              placeholder="5×5"
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
          <label>
            {t("dota.tournaments.bracket.formatLabel")}
            <select disabled={!form.automaticBracket}
              value={form.bracketFormat}
              onChange={(event) => setForm({ ...form, bracketFormat: event.target.value as TournamentAdminForm["bracketFormat"] })}>
              <option value="SINGLE_ELIMINATION">{t("dota.tournaments.bracket.single")}</option>
              <option value="DOUBLE_ELIMINATION">{t("dota.tournaments.bracket.double")}</option>
            </select>
          </label>
          <p>{t(form.bracketFormat === "DOUBLE_ELIMINATION" && form.automaticBracket
            ? "dota.tournaments.bracket.doubleLead" : "dota.tournaments.bracket.singleLead")}</p>
          <p>{t("dota.tournaments.bracket.bo1Timing")}</p>
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
        <section className={styles.sponsorFields} aria-labelledby="tournament-sponsors-title">
          <div className={styles.sponsorFieldsHeading}>
            <div>
              <h3 id="tournament-sponsors-title">{t("dota.tournaments.admin.sponsorsTitle")}</h3>
              <p>{t("dota.tournaments.admin.sponsorsLead")}</p>
            </div>
            <button
              className="button-secondary"
              disabled={busy || form.sponsors.length >= 8}
              onClick={() => setForm({
                ...form,
                sponsors: [...form.sponsors, { name: "", url: "", logoUrl: "" }]
              })}
              type="button"
            >
              {t("dota.tournaments.admin.addSponsor")}
            </button>
          </div>
          {form.sponsors.map((sponsor, index) => (
            <fieldset className={styles.sponsorFieldsRow} key={`sponsor-${index}`}>
              <legend>{t("dota.tournaments.admin.sponsorNumber", { number: String(index + 1) })}</legend>
              <label>
                {t("dota.tournaments.admin.sponsorName")}
                <input
                  maxLength={100}
                  onChange={(event) => setForm({
                    ...form,
                    sponsors: form.sponsors.map((item, itemIndex) => itemIndex === index
                      ? { ...item, name: event.target.value } : item)
                  })}
                  value={sponsor.name}
                />
              </label>
              <label>
                {t("dota.tournaments.admin.sponsorUrl")}
                <input
                  maxLength={1000}
                  onChange={(event) => setForm({
                    ...form,
                    sponsors: form.sponsors.map((item, itemIndex) => itemIndex === index
                      ? { ...item, url: event.target.value } : item)
                  })}
                  type="url"
                  value={sponsor.url}
                />
              </label>
              <label>
                {t("dota.tournaments.admin.sponsorLogoUrl")}
                <input
                  maxLength={1000}
                  onChange={(event) => setForm({
                    ...form,
                    sponsors: form.sponsors.map((item, itemIndex) => itemIndex === index
                      ? { ...item, logoUrl: event.target.value } : item)
                  })}
                  type="url"
                  value={sponsor.logoUrl}
                />
              </label>
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => setForm({
                  ...form,
                  sponsors: form.sponsors.filter((_, itemIndex) => itemIndex !== index)
                })}
                type="button"
              >
                {t("dota.tournaments.admin.removeSponsor")}
              </button>
            </fieldset>
          ))}
        </section>
        <button className="button-primary" disabled={busy || !form.title.trim()} type="submit">
          {busy
            ? t("common.loadingEllipsis")
            : t(editingSlug ? "dota.tournaments.admin.saveChanges" : "dota.tournaments.admin.create")}
        </button>
        {editingSlug ? (
          <button className="button-secondary" disabled={busy} onClick={cancelEdit} type="button">
            {t("dota.tournaments.admin.cancelEdit")}
          </button>
        ) : null}
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
                {t("dota.tournaments.admin.teamCount", {
                  current: String(item.registeredTeams),
                  limit: item.maxTeams === null ? "∞" : String(item.maxTeams)
                })} · {item.slug}
              </span>
            </div>
            {canEditTournament(item) ? (
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => beginEdit(item)}
                type="button"
              >
                {t("dota.tournaments.admin.editParameters")}
              </button>
            ) : null}
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
