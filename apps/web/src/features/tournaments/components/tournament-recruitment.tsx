"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/locale-provider";
import { fetchTournamentRecruitment, inviteTournamentRecruit, setTournamentRecruitment, type TournamentRecruitmentBoard } from "../api/tournament-recruitment-api";
import styles from "./dota-tournament-squad-view.module.css";

export function TournamentRecruitment({ slug, entryId, token }: { slug: string; entryId: string; token: string }) {
  const { resolvedLocale } = useLocale();
  const text = (ru: string, en: string) => resolvedLocale === "ru" ? ru : en;
  const [board, setBoard] = useState<TournamentRecruitmentBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(false);
  const epoch = useRef(0);
  const active = useRef(true);
  const roleName = (role: string) => ({ "1": text("Керри", "Carry"), "2": text("Мид", "Mid"), "3": text("Оффлейн", "Offlane"), "4": text("Саппорт", "Support"), "5": text("Хард-саппорт", "Hard support") }[role] ?? role);
  async function reload() {
    const request = ++epoch.current;
    try {
      const result = await fetchTournamentRecruitment(slug, entryId, token);
      if (active.current && request === epoch.current) { setBoard(result); setError(null); }
    } catch { if (active.current && request === epoch.current) setError(text("Не удалось обновить игроков. Попробуй ещё раз.", "Could not refresh players. Please retry.")); }
  }
  useEffect(() => {
    active.current = true;
    void reload();
    const timer = window.setInterval(() => { if (!document.hidden) void reload(); }, 15_000);
    return () => { active.current = false; epoch.current++; window.clearInterval(timer); };
  }, [slug, entryId, token]);
  async function searching(enabled: boolean) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await setTournamentRecruitment(slug, entryId, token, enabled);
      if (active.current) { epoch.current++; setBoard(result); }
    } catch { if (active.current) setError(text("Не удалось изменить поиск. Обнови страницу и попробуй снова.", "Could not change recruitment. Refresh and retry.")); }
    finally { if (active.current) setBusy(false); }
  }
  async function invite(player: TournamentRecruitmentBoard["players"][number], position: string) {
    if (busy || !position) return;
    setBusy(true); setError(null);
    try {
      await inviteTournamentRecruit(slug, entryId, token, player.queueId, player.generation, position);
      if (active.current) setSent(previous => ({ ...previous, [player.queueId + ":" + player.generation]: true }));
    } catch { if (active.current) { setError(text("Игрок или позиция уже изменились. Обнови список.", "This player or position changed. Refresh the list.")); } }
    finally { if (active.current) setBusy(false); }
  }
  return <section className={styles.panel} aria-labelledby="tournament-recruitment-title">
    <h2 id="tournament-recruitment-title">{text("Игроки для турнира", "Tournament players")}</h2>
    {error ? <p className={styles.hint} role="alert">{error}</p> : null}
    {!board ? <p className={styles.hint} role="status">{text("Проверяем, кто ищет команду…", "Checking who is looking for a team…")}</p>
      : !board.needed ? <p className={styles.hint}>{text("Состав заполнен или набор завершён.", "The roster is full or recruitment has ended.")}</p> : <>
        <p className={styles.hint}>{board.enabled
          ? text("Поиск включён. FDP сообщит в Telegram о новых подходящих игроках. Можно остановить поиск, чтобы отключить уведомления.", "Recruitment is on. FDP will notify you in Telegram about new matching players. Stop recruitment to disable alerts.")
          : text("Нажми «Ищем игроков», чтобы получать рекомендации и уведомления о новых игроках этого турнира.", "Start recruitment to get recommendations and alerts for this tournament.")}</p>
        <button className={board.enabled ? "button-secondary" : "button-primary"} disabled={busy} onClick={() => void searching(!board.enabled)}>
          {board.enabled ? text("Остановить поиск игроков", "Stop recruitment") : text("Ищем игроков", "Find players")}</button>
        {board.enabled ? <>
          {!board.players.length ? <p className={styles.hint}>{text("Подходящих игроков пока нет. Оставь поиск включённым — сообщим о новых.", "No matching players yet. Keep recruitment on to hear about new players.")}</p> : null}
          {board.players.slice(0, expanded ? 12 : 3).map(player => {
            const key = player.queueId + ":" + player.generation;
            const position = player.positions.includes(selected[key] ?? "") ? selected[key]! : player.positions[0] ?? "";
            return <div className={styles.request} key={key}>
              <strong><Link href={"/dota/" + encodeURIComponent(player.profileSlug)}>{player.name}</Link></strong>
              <small>{player.mmr ?? "—"} MMR · {player.roles.map(roleName).join(" · ")}</small>
              <label>{text("Предложить позицию", "Offer a position")}<select value={position} disabled={busy} onChange={event => setSelected(previous => ({ ...previous, [key]: event.target.value }))}>
                {player.positions.map(value => <option key={value} value={value}>{roleName(value)}</option>)}
              </select></label>
              <button className="button-secondary" disabled={busy || sent[key] || !position} onClick={() => void invite(player, position)}>
                {sent[key] ? text("Приглашение отправлено", "Invitation sent") : text("Пригласить в команду", "Invite to team")}</button>
            </div>;
          })}
          {board.players.length > 3 ? <button className="button-secondary" onClick={() => setExpanded(value => !value)}>{expanded ? text("Свернуть игроков", "Show fewer players") : text(`Показать ещё ${board.players.length - 3}`, `Show ${board.players.length - 3} more`)}</button> : null}
        </> : null}
      </>}
    <button className="button-secondary" disabled={busy} onClick={() => void reload()}>{text("Обновить игроков", "Refresh players")}</button>
  </section>;
}
