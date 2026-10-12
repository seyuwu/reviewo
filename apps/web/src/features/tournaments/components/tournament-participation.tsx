"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api/api-error";
import { buildDotaBotProfileUrl } from "../../../lib/config/dota-bot";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyDotaProfile } from "../../dota/api/dota-api";
import { GamesSearchCinematic } from "../../games/components/games-search-cinematic";
import { useLocale } from "../../i18n/locale-provider";
import { fetchMyParties } from "../../social/api/social-api";
import type { GameParty } from "../../social/types/social";
import type { DotaTournament } from "../types/dota-tournament";
import { createDotaTournamentSquad, joinDotaTournamentEntry, recordDotaTournamentSponsorClick, registerDotaTeamForTournament } from "../api/dota-tournaments-api";
import { cancelTournamentSoloSearch, getTournamentParticipation, startTournamentSoloSearch, type TournamentParticipationState } from "../api/tournament-participation-api";
import { tournamentRoomUrl } from "../api/tournament-rooms-api";
import { TournamentTelegramOnboarding } from "./tournament-telegram-onboarding";
import { acceptTournamentRecruitInvitation, fetchTournamentRecruitInvitation, type TournamentRecruitInvitation } from "../api/tournament-recruitment-api";
import styles from "./tournament-participation.module.css";

const TOURNAMENT_POSITIONS = ["1", "2", "3", "4", "5"] as const;

export function TournamentParticipation({ tournament, open, onOpenChange, onUpdated }: {
  tournament: DotaTournament; open: boolean; onOpenChange: (open: boolean) => void; onUpdated: () => void;
}) {
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [profileState, setProfileState] = useState<"checking" | "ready" | "missing" | "error">("checking");
  const { resolvedLocale: locale } = useLocale();
  const text = (ru: string, en: string) => locale === "ru" ? ru : en;
  useEffect(() => {
    if (!isAuthSessionLoaded || !open) return;
    if (!authSession) { setProfileState("missing"); return; }
    let active = true;
    setProfileState("checking");
    void fetchMyDotaProfile(authSession.accessToken).then(() => { if (active) setProfileState("ready"); })
      .catch((error: unknown) => { if (active) setProfileState(error instanceof ApiError && error.status === 404 ? "missing" : "error"); });
    return () => { active = false; };
  }, [authSession?.accessToken, isAuthSessionLoaded, open]);
  if (!open) return null;
  if (!isAuthSessionLoaded || profileState === "checking") return <section className={styles.panel} role="status">{text("Готовим участие…", "Preparing participation…")}</section>;
  if (profileState === "error") return <section className={styles.panel}><p className={styles.error}>{text("Не удалось проверить профиль. Попробуй открыть участие ещё раз.", "Could not check your profile. Please retry.")}</p><button className="button-secondary" onClick={() => onOpenChange(false)}>{text("Закрыть", "Close")}</button></section>;
  if (profileState === "missing") return <GamesSearchCinematic purpose="tournament" onVisualPhase={() => undefined}
    onPrepared={() => undefined} onComplete={() => setProfileState("ready")} />;
  return <TournamentTelegramOnboarding requireAccess onDismiss={() => onOpenChange(false)}>
    <section className={styles.panel} id="tournament-participation">
      <ParticipationFlow key={`${authSession?.userId}:${tournament.id}`} tournament={tournament} onUpdated={onUpdated} onClose={() => onOpenChange(false)} />
    </section>
  </TournamentTelegramOnboarding>;
}

function ParticipationFlow({ tournament, onUpdated, onClose }: { tournament: DotaTournament; onUpdated: () => void; onClose: () => void }) {
  const { authSession } = useAuthSession();
  const { resolvedLocale: locale } = useLocale();
  const text = (ru: string, en: string) => locale === "ru" ? ru : en;
  const params = useSearchParams();
  const [participation, setParticipation] = useState<TournamentParticipationState | null>(null);
  const [mode, setMode] = useState<"solo" | "friends" | null>(null);
  const [role, setRole] = useState("");
  const [team, setTeam] = useState<GameParty | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ignoreTarget, setIgnoreTarget] = useState(false);
  const [searchDraft, setSearchDraft] = useState<string[] | null>(null);
  const [suggestionRoles, setSuggestionRoles] = useState<Record<string, string>>({});
  const current = useRef(0);
  const rosterSnapshot = useRef<string | null>(null);
  const alive = useRef(true);
  const token = authSession?.accessToken;
  const slug = tournament.slug;
  const entryTarget = params.get("entry");
  const target = !ignoreTarget ? tournament.entries.find(entry => entry.id === entryTarget && ["RECRUITING", "REGISTERED", "RESERVE"].includes(entry.status)) : undefined;
  const invitedRoles = TOURNAMENT_POSITIONS.filter(value => !target?.members.some(member => member.positionRole === value));
  const ownRole = role || participation?.roles[0] || "1";
  const roleName = (value: string) => ({ "1": text("Керри", "Carry"), "2": text("Мид", "Mid"), "3": text("Оффлейн", "Offlane"), "4": text("Саппорт", "Support"), "5": text("Хард-саппорт", "Hard support") }[value] ?? value);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; current.current++; };
  }, []);
  async function reload(clearError = true, refreshRoster = false) {
    if (!token) return;
    const epoch = ++current.current;
    try {
      const next = await getTournamentParticipation(slug, token);
      if (!alive.current || epoch !== current.current) return;
      const snapshot = `${next.state}:${next.entry?.id ?? ""}:${next.entry?.status ?? ""}:${next.entry?.members.length ?? 0}`;
      if (refreshRoster && rosterSnapshot.current !== null && rosterSnapshot.current !== snapshot && next.entry) onUpdated();
      rosterSnapshot.current = snapshot;
      setParticipation(next); if (clearError) setError(null);
    } catch { if (alive.current && epoch === current.current) setError(text("Не удалось обновить участие. Повтори попытку.", "Could not refresh participation. Retry.")); }
  }
  useEffect(() => { void reload(); }, [token, slug]);
  useEffect(() => {
    if (!token || !participation || !["WAITING", "REQUESTED", "JOINED"].includes(participation.state)) return;
    const timer = window.setInterval(() => { void reload(true, true); }, 5000);
    return () => window.clearInterval(timer);
  }, [token, slug, participation?.state]);
  useEffect(() => {
    if (mode !== "friends" || !token) return;
    let active = true;
    void fetchMyParties(token).then(parties => { if (active) setTeam(parties.team?.isOwner ? parties.team : null); }).catch(() => undefined);
    return () => { active = false; };
  }, [mode, token]);

  async function act(action: () => Promise<unknown>) {
    if (busy || !token) return;
    setBusy(true); setError(null);
    try { await action(); if (alive.current) { await reload(); onUpdated(); } }
    catch (cause) {
      if (alive.current) {
        setError(cause instanceof ApiError && cause.status === 409
          ? text("Место или состав изменились. Обнови список и попробуй снова.", "This slot or roster changed. Refresh and retry.")
          : text("Не получилось завершить действие. Данные сохранены — попробуй снова.", "Could not complete this action. Please retry."));
        void reload(false);
        onUpdated();
      }
    } finally { if (alive.current) setBusy(false); }
  }

  function refreshParticipation() { void reload(); onUpdated(); }

  useEffect(() => {
    const sponsorId = params.get("supporter");
    const sponsor = tournament.sponsors.find(item => item.id === sponsorId);
    if (!sponsor || !token) return;
    let active = true;
    void recordDotaTournamentSponsorClick(slug, sponsor.id, token).then(() => {
      if (active) window.location.replace(sponsor.url);
    }).catch(() => { if (active) setError(text("Не удалось открыть партнёра. Повтори попытку.", "Could not open the partner. Please retry.")); });
    return () => { active = false; };
  }, [token, slug, params]);

  const status = participation?.entry;
  const invitationId = params.get("recruitInvite");
  if (participation?.state === "JOINED" && status) return <>
    <h2 className={styles.heading}>{text("Ты в команде", "You are on the team")} «{status.name}»</h2>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <p className={styles.status}>{status.status === "REGISTERED" ? text("✅ Команда зарегистрирована в турнире", "✅ Team registered for the tournament")
      : status.status === "RESERVE" ? text("Состав в резерве: место в основной сетке пока не подтверждено", "Reserve roster: a main bracket place is not confirmed")
      : text(`Набираем состав: ${status.members.length}/5`, `Building the roster: ${status.members.length}/5`)}</p>
    <p className={styles.lead}>{text("Твоя позиция", "Your position")}: {roleName(status.ownRole || "")}</p>
    <div className={styles.actions}><Link className="button-primary" href={tournamentRoomUrl(slug, status.id)}>{text("💬 Моя команда", "💬 My team")}</Link>
      <button className="button-secondary" onClick={() => {
        void navigator.clipboard.writeText(`${buildDotaBotProfileUrl()}?start=te_${status.id.replaceAll("-", "")}`)
          .then(() => setCopied(true)).catch(() => setError(text("Не удалось скопировать ссылку.", "Could not copy the link.")));
      }}>{copied ? text("Ссылка скопирована", "Link copied") : text("🔗 Пригласить друзей", "🔗 Invite friends")}</button><button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button></div>
  </>;
  if (participation?.state === "CLOSED") return <><h2 className={styles.heading}>{text("Запись завершена", "Registration ended")}</h2><p className={styles.lead}>{text("В этом турнире новые составы уже не принимаются.", "This tournament is no longer accepting new rosters.")}</p><button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button></>;
  if (participation?.state === "REQUESTED") return <><h2 className={styles.heading}>{text("Заявка отправлена", "Application sent")}</h2>{error ? <p className={styles.error} role="alert">{error}</p> : null}<p className={styles.status}>{text("Ждём решения капитана", "Waiting for the captain")} «{participation.request?.entryName}». {text("Место пока не подтверждено.", "Your place is not confirmed yet.")}</p><div className={styles.actions}><button className="button-secondary" onClick={refreshParticipation}>{text("Проверить ответ", "Check response")}</button><button className="button-secondary" disabled={busy} onClick={() => void act(() => cancelTournamentSoloSearch(slug, token!))}>{text("Отозвать заявку", "Withdraw application")}</button><button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button></div></>;
  if (invitationId && token) return <TournamentInvitation slug={slug} id={invitationId} token={token} onJoined={refreshParticipation} onClose={onClose} />;
  return <>
    <h2 className={styles.heading}>{text("Участие в турнире", "Tournament participation")}</h2>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!participation ? <p role="status">{text("Проверяем состав…", "Checking your roster…")}</p>
      : participation.sponsorRequired ? <>
        <p className={styles.lead}>{text("Перед участием открой одного из партнёров турнира. После перехода доступ сохранится для твоего аккаунта.", "Open one tournament partner before participating. Your account will keep this access.")}</p>
        <div className={styles.actions}>{participation.sponsors.map(sponsor => <a className="button-primary" href={sponsor.url} target="_blank" rel="noopener noreferrer" key={sponsor.id}
          onClick={() => { void act(() => recordDotaTournamentSponsorClick(slug, sponsor.id, token!)); }}>{sponsor.name} ↗</a>)}</div>
      </> : participation.state === "WAITING" ? <>
        <p className={styles.status}>{participation.queueMode === "AUTO" ? text("Автоподбор включён", "Automatic matching is on") : text("Ты ищешь команду для этого турнира", "You are looking for a tournament team")}</p>
        <p className={styles.lead}>{participation.queueMode === "AUTO"
          ? text("Подберём свободное место или соберём новый состав. Можно закрыть страницу — FDP сообщит о результате в Telegram.", "We will find an open position or form a new roster. FDP will notify you in Telegram.")
          : text("Капитаны видят тебя в списке игроков и могут пригласить. Можно выбрать команду ниже и вступить или подать заявку. Сам поиск не записывает тебя в состав.", "Captains can find and invite you. Choose a team below to join or apply. This search does not enroll you automatically.")}</p>
        <p className={styles.hint}>{text("Позиции для турнира", "Tournament positions")}</p>
        <div className={styles.roleChoices}>{TOURNAMENT_POSITIONS.map(value => {
          const chosen = (searchDraft ?? participation.queueRoles).includes(value);
          return <button key={value} type="button" className={chosen ? styles.roleSelected : styles.roleChoice} aria-pressed={chosen} disabled={busy}
            onClick={() => { const currentRoles = searchDraft ?? participation.queueRoles; setSearchDraft(chosen ? currentRoles.filter(item => item !== value) : [...currentRoles, value]); }}>{roleName(value)}</button>;
        })}</div>
        {searchDraft ? <button className="button-secondary" disabled={busy || !searchDraft.length} onClick={() => void act(async () => {
          const result = await startTournamentSoloSearch(slug, token!, searchDraft, participation.queueMode ?? "BOARD"); setSearchDraft(null); return result;
        })}>{text("Сохранить позиции поиска", "Save search positions")}</button> : null}
        <div className={styles.cards}>{participation.suggestions.map(suggestion => {
          const selected = suggestion.freeRoles.includes(suggestionRoles[suggestion.entryId] ?? "") ? suggestionRoles[suggestion.entryId]! : suggestion.role;
          return <div key={suggestion.entryId} className={styles.card}><div><strong>{suggestion.name} · {suggestion.memberCount}/5</strong><span className={styles.meta}>{suggestion.status === "RESERVE" ? text("Резерв · ", "Reserve · ") : ""}{suggestion.averageMmr ?? "—"} MMR · {suggestion.joinMode === "CONFIRM" ? text("По заявке капитану", "Captain approval") : text("Свободное вступление", "Open enrollment")}</span></div>
            <label className={styles.field}>{text("Позиция", "Position")}<select value={selected} disabled={busy} onChange={event => setSuggestionRoles(previous => ({ ...previous, [suggestion.entryId]: event.target.value }))}>{suggestion.freeRoles.map(value => <option key={value} value={value}>{roleName(value)}</option>)}</select></label>
            <button className="button-primary" disabled={busy} onClick={() => void act(() => joinDotaTournamentEntry(slug, suggestion.entryId, selected as "1"|"2"|"3"|"4"|"5", token!))}>{suggestion.joinMode === "CONFIRM" ? text("Подать заявку", "Apply") : text("Вступить", "Join")}</button></div>;
        })}</div>
        {!participation.suggestions.length ? <p className={styles.hint}>{text("Открытых мест пока нет. Поиск сохранён — капитаны смогут пригласить тебя, когда начнут набор.", "No open positions yet. Your search is saved so captains can invite you.")}</p> : null}
        <div className={styles.actions}>{participation.queueMode !== "AUTO" ? <button className="button-secondary" disabled={busy} onClick={() => void act(() => startTournamentSoloSearch(slug, token!, participation.queueRoles, "AUTO"))}>{text("Включить автоподбор", "Enable automatic matching")}</button> : null}<button className="button-secondary" disabled={busy} onClick={() => void act(() => cancelTournamentSoloSearch(slug, token!))}>{text("Остановить поиск команды", "Stop team search")}</button><button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button></div>
      </> : target ? <>
        <p className={styles.lead}>{text("Тебя пригласили в состав", "You were invited to")} «{target.teamName}» · {target.members.length}/5</p>
        {target.members.length >= 5 || !invitedRoles.length ? <p className={styles.hint}>{text("Все позиции в составе уже заняты. Можно подобрать другой состав.", "All positions in this roster are taken. You can find another roster.")}</p> : null}
        <div className={styles.actions}>{target.members.length < 5 ? invitedRoles.map(value => <button key={value} className="button-primary" disabled={busy}
          onClick={() => void act(() => joinDotaTournamentEntry(slug, target.id, value as "1"|"2"|"3"|"4"|"5", token!))}>{target.joinMode === "OPEN" ? text("Вступить", "Join") : text("Подать заявку", "Apply")} · {roleName(value)}</button>) : null}
          <button className="button-secondary" disabled={busy} onClick={() => { setIgnoreTarget(true); setMode("solo"); }}>{text("Подобрать другую команду", "Find another team")}</button></div>
      </> : !mode ? <>
        <p className={styles.lead}>{text("Можно участвовать одному — полную команду заранее собирать не нужно.", "You can join on your own: you do not need a full team yet.")}</p>
        <div className={styles.choices}><button className={styles.choice} disabled={busy} onClick={() => void act(() => startTournamentSoloSearch(slug, token!, undefined, "BOARD"))}><strong>{text("Найти команду для турнира", "Find a tournament team")}</strong><span>{text("Начать поиск, увидеть составы и получать приглашения капитанов", "Start searching, see rosters and receive captain invitations")}</span></button>
          <button className={styles.choice} onClick={() => setMode("friends")}><strong>{text("👥 Мы с друзьями", "👥 With friends")}</strong><span>{text("Выбрать свою команду или создать состав", "Use your team or create a roster")}</span></button></div>
      </> : mode === "solo" ? <>
        <p className={styles.lead}>{text("Подходящие открытые составы", "Matching open rosters")}</p>
        <div className={styles.cards}>{participation.suggestions.map(suggestion => <div key={suggestion.entryId} className={styles.card}><div><strong>{suggestion.name} · {suggestion.memberCount}/5</strong><span className={styles.meta}>{roleName(suggestion.role)}{suggestion.averageMmr !== null ? ` · ${suggestion.averageMmr} MMR` : ""}</span></div><button className="button-primary" disabled={busy}
          onClick={() => void act(() => joinDotaTournamentEntry(slug, suggestion.entryId, suggestion.role as "1"|"2"|"3"|"4"|"5", token!))}>{suggestion.joinMode === "CONFIRM" ? text("Подать заявку", "Apply") : text("Вступить", "Join")} · {roleName(suggestion.role)}</button></div>)}</div>
        <div className={styles.actions}><button className="button-primary" disabled={busy} onClick={() => void act(() => startTournamentSoloSearch(slug, token!, undefined, "BOARD"))}>{text("Начать поиск команды", "Start team search")}</button><button className="button-secondary" onClick={() => setMode(null)}>{text("← Назад", "← Back")}</button></div>
        <p className={styles.hint}>{text("Поиск сохраняется для этого турнира. Капитаны смогут пригласить тебя; автоподбор можно включить отдельно.", "Your search is saved for this tournament. Captains can invite you; automatic matching can be enabled separately.")}</p>
      </> : <>
        {team ? <div className={styles.card}><div><strong>{team.name}</strong><span className={styles.meta}>{team.members.length}/5</span></div><button className="button-primary" disabled={busy} onClick={() => void act(() => registerDotaTeamForTournament(slug, team.slug, token!, "OPEN"))}>{text("Записать свою команду", "Register my team")}</button></div> : null}
        <p className={styles.lead}>{text("Создай состав и пригласи друзей. Название подставим автоматически.", "Create a roster and invite friends. We will generate the name.")}</p>
        <label className={styles.field}>{text("Твоя позиция", "Your position")}<select value={ownRole} onChange={event => setRole(event.target.value)}>{TOURNAMENT_POSITIONS.map(value => <option key={value} value={value}>{roleName(value)}</option>)}</select></label>
        <p className={styles.hint}>{text("Для турнира можно выбрать любую позицию. Роли в профиле не изменятся.", "You can choose any tournament position. Your profile roles stay the same.")}</p>
        <div className={styles.actions}><button className="button-primary" disabled={busy || !ownRole} onClick={() => void act(() => createDotaTournamentSquad(slug, { joinMode: "OPEN", positionRole: ownRole as "1"|"2"|"3"|"4"|"5" }, token!))}>{text("Создать состав", "Create roster")}</button><button className="button-secondary" onClick={() => setMode(null)}>{text("← Назад", "← Back")}</button></div>
        <p className={styles.hint}>{text("Игроки смогут вступать сразу. Вступление через заявку можно включить в управлении составом.", "Players can join immediately. Captain approval can be enabled in roster settings.")}</p>
      </>}
    <div className={styles.actions}>{participation && !mode && participation.state === "NONE" ? <button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button> : null}<button className="button-secondary" disabled={busy} onClick={refreshParticipation}>{text("Обновить", "Refresh")}</button></div>
  </>;
}

function TournamentInvitation({ slug, id, token, onJoined, onClose }: {
  slug: string; id: string; token: string; onJoined: () => void; onClose: () => void;
}) {
  const { resolvedLocale } = useLocale();
  const text = (ru: string, en: string) => resolvedLocale === "ru" ? ru : en;
  const [invitation, setInvitation] = useState<TournamentRecruitInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void fetchTournamentRecruitInvitation(slug, id, token).then(result => { if (alive.current) setInvitation(result); })
      .catch(() => { if (alive.current) setError(text("Приглашение истекло или состав изменился. Можно продолжить поиск другой команды.", "The invitation expired or the roster changed. You can keep searching for another team.")); });
    return () => { alive.current = false; };
  }, [slug, id, token]);
  async function accept(role: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await acceptTournamentRecruitInvitation(slug, id, token, role);
      if (alive.current) onJoined();
    } catch { if (alive.current) setError(text("Место или поиск уже изменились. Обнови участие.", "This position or search changed. Refresh participation.")); }
    finally { if (alive.current) setBusy(false); }
  }
  return <>
    <h2 className={styles.heading}>{text("Приглашение капитана", "Captain invitation")}</h2>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {invitation ? <><p className={styles.lead}>{invitation.senderName} {text("приглашает в команду", "invites you to")} «{invitation.name}».</p>
      {invitation.status === "RESERVE" ? <p className={styles.hint}>{text("Этот состав в резерве. Место в основной сетке не подтверждено.", "This roster is in reserve. A main bracket place is not confirmed.")}</p> : null}
      <p className={styles.hint}>{text("Подтверди позицию — приглашение капитана позволяет вступить сразу.", "Confirm the position to join directly through the captain's invitation.")}</p>
      <div className={styles.actions}>{invitation.roles.map(role => <button className="button-primary" disabled={busy} key={role} onClick={() => void accept(role)}>{text("Вступить на позицию", "Join in position")} {role}</button>)}</div></>
      : !error ? <p role="status">{text("Проверяем приглашение…", "Checking invitation…")}</p> : null}
    <div className={styles.actions}><button className="button-secondary" onClick={onJoined}>{text("Обновить участие", "Refresh participation")}</button><button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button></div>
  </>;
}
