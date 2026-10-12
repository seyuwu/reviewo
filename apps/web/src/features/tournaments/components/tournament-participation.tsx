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
import styles from "./tournament-participation.module.css";

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
  return <section className={`${styles.panel} ${styles.gate}`} id="tournament-participation">
    <TournamentTelegramOnboarding requireAccess>
      <ParticipationFlow key={`${authSession?.userId}:${tournament.id}`} tournament={tournament} onUpdated={onUpdated} onClose={() => onOpenChange(false)} />
    </TournamentTelegramOnboarding>
  </section>;
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
  const current = useRef(0);
  const rosterSnapshot = useRef<string | null>(null);
  const alive = useRef(true);
  const token = authSession?.accessToken;
  const slug = tournament.slug;
  const entryTarget = params.get("entry");
  const target = !ignoreTarget ? tournament.entries.find(entry => entry.id === entryTarget && ["RECRUITING", "REGISTERED", "RESERVE"].includes(entry.status)) : undefined;
  const invitedRoles = participation?.roles.filter(value => !target?.members.some(member => member.positionRole === value)) ?? [];
  const ownRole = role || participation?.roles[0] || "";
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
  return <>
    <h2 className={styles.heading}>{text("Участие в турнире", "Tournament participation")}</h2>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!participation ? <p role="status">{text("Проверяем состав…", "Checking your roster…")}</p>
      : participation.sponsorRequired ? <>
        <p className={styles.lead}>{text("Перед участием открой одного из партнёров турнира. После перехода доступ сохранится для твоего аккаунта.", "Open one tournament partner before participating. Your account will keep this access.")}</p>
        <div className={styles.actions}>{participation.sponsors.map(sponsor => <a className="button-primary" href={sponsor.url} target="_blank" rel="noopener noreferrer" key={sponsor.id}
          onClick={() => { void act(() => recordDotaTournamentSponsorClick(slug, sponsor.id, token!)); }}>{sponsor.name} ↗</a>)}</div>
      </> : participation.state === "WAITING" ? <>
        <p className={styles.status}>{text("🔎 Подбираем команду для этого турнира", "🔎 Finding a team for this tournament")}</p>
        <p className={styles.lead}>{text("Можно закрыть страницу — очередь сохранится. Когда найдётся состав, FDP сообщит в Telegram.", "You can close this page: your search is saved. FDP will notify you in Telegram when matched.")}</p>
        <p className={styles.hint}>{participation.queueRoles.map(roleName).join(" · ")}</p>
        <div className={styles.actions}><button className="button-secondary" disabled={busy} onClick={() => void act(() => cancelTournamentSoloSearch(slug, token!))}>{text("Остановить подбор", "Stop matching")}</button><button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button></div>
      </> : target ? <>
        <p className={styles.lead}>{text("Тебя пригласили в состав", "You were invited to")} «{target.teamName}» · {target.members.length}/5</p>
        {target.members.length >= 5 || !invitedRoles.length ? <p className={styles.hint}>{text("На твоих позициях свободных мест уже нет. Можно подобрать другой состав.", "Your positions have no open slots here. You can find another roster.")}</p> : null}
        <div className={styles.actions}>{target.members.length < 5 ? invitedRoles.map(value => <button key={value} className="button-primary" disabled={busy}
          onClick={() => void act(() => joinDotaTournamentEntry(slug, target.id, value as "1"|"2"|"3"|"4"|"5", token!))}>{target.joinMode === "OPEN" ? text("Вступить", "Join") : text("Подать заявку", "Apply")} · {roleName(value)}</button>) : null}
          <button className="button-secondary" disabled={busy} onClick={() => { setIgnoreTarget(true); setMode("solo"); }}>{text("Подобрать другую команду", "Find another team")}</button></div>
      </> : !mode ? <>
        <p className={styles.lead}>{text("Можно участвовать одному — полную команду заранее собирать не нужно.", "You can join on your own: you do not need a full team yet.")}</p>
        <div className={styles.choices}><button className={styles.choice} onClick={() => setMode("solo")}><strong>{text("🎮 Я один", "🎮 On my own")}</strong><span>{text("Подобрать команду со свободной позицией", "Find a team with an open position")}</span></button>
          <button className={styles.choice} onClick={() => setMode("friends")}><strong>{text("👥 Мы с друзьями", "👥 With friends")}</strong><span>{text("Выбрать свою команду или создать состав", "Use your team or create a roster")}</span></button></div>
      </> : mode === "solo" ? <>
        <p className={styles.lead}>{text("Подходящие открытые составы", "Matching open rosters")}</p>
        <div className={styles.cards}>{participation.suggestions.map(suggestion => <div key={suggestion.entryId} className={styles.card}><div><strong>{suggestion.name} · {suggestion.memberCount}/5</strong><span className={styles.meta}>{roleName(suggestion.role)}{suggestion.averageMmr !== null ? ` · ${suggestion.averageMmr} MMR` : ""}</span></div><button className="button-primary" disabled={busy}
          onClick={() => void act(() => joinDotaTournamentEntry(slug, suggestion.entryId, suggestion.role as "1"|"2"|"3"|"4"|"5", token!))}>{text("Вступить", "Join")} · {roleName(suggestion.role)}</button></div>)}</div>
        <div className={styles.actions}><button className="button-primary" disabled={busy} onClick={() => void act(() => startTournamentSoloSearch(slug, token!))}>{text("Подобрать автоматически", "Find a team automatically")}</button><button className="button-secondary" onClick={() => setMode(null)}>{text("← Назад", "← Back")}</button></div>
        <p className={styles.hint}>{text("Если свободного места нет, сохраним тебя в очереди и соберём новый состав с другими участниками.", "If no slot is available, your search stays queued and we will form a new roster with other entrants.")}</p>
      </> : <>
        {team ? <div className={styles.card}><div><strong>{team.name}</strong><span className={styles.meta}>{team.members.length}/5</span></div><button className="button-primary" disabled={busy} onClick={() => void act(() => registerDotaTeamForTournament(slug, team.slug, token!, "OPEN"))}>{text("Записать свою команду", "Register my team")}</button></div> : null}
        <p className={styles.lead}>{text("Создай состав и пригласи друзей. Название подставим автоматически.", "Create a roster and invite friends. We will generate the name.")}</p>
        <label className={styles.field}>{text("Твоя позиция", "Your position")}<select value={ownRole} onChange={event => setRole(event.target.value)}>{participation.roles.map(value => <option key={value} value={value}>{roleName(value)}</option>)}</select></label>
        <div className={styles.actions}><button className="button-primary" disabled={busy || !ownRole} onClick={() => void act(() => createDotaTournamentSquad(slug, { joinMode: "OPEN", positionRole: ownRole as "1"|"2"|"3"|"4"|"5" }, token!))}>{text("Создать состав", "Create roster")}</button><button className="button-secondary" onClick={() => setMode(null)}>{text("← Назад", "← Back")}</button></div>
        <p className={styles.hint}>{text("Игроки смогут вступать сразу. Вступление через заявку можно включить в управлении составом.", "Players can join immediately. Captain approval can be enabled in roster settings.")}</p>
      </>}
    <div className={styles.actions}>{participation && !mode && participation.state === "NONE" ? <button className="button-secondary" onClick={onClose}>{text("Закрыть", "Close")}</button> : null}<button className="button-secondary" disabled={busy} onClick={refreshParticipation}>{text("Обновить", "Refresh")}</button></div>
  </>;
}
