"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { io } from "socket.io-client";
import { publicEnv } from "../../../lib/config/public-env";
import { ApiError } from "../../../lib/api/api-error";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchMatchChat, sendMatchChat, type MatchChatMessage, type MatchChatPage } from "../api/tournament-match-chat-api";
import styles from "./tournament-match-chat.module.css";

type MatchPlayer = MatchChatPage["targets"][number];
type ActiveMention = { start: number; end: number; query: string };

export function TournamentMatchChat({ slug, matchId, token }: { slug: string; matchId: string; token: string }) {
  const t = useTranslation();
  const [messages, setMessages] = useState<MatchChatMessage[]>([]);
  const [targets, setTargets] = useState<MatchChatPage["targets"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [error, setError] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [loading, setLoading] = useState(true);
  const epoch = useRef(0);
  const reloadLock = useRef(false);
  const sending = useRef(false);
  const connected = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const scrolledToChat = useRef(false);
  const suggestionListId = `match-chat-mention-list-${matchId}`;

  const suggestions = activeMention && mentions.length < 5
    ? targets.filter((target) => !mentions.includes(target.userId) &&
      target.displayName.toLocaleLowerCase().includes(activeMention.query.toLocaleLowerCase())).slice(0, 10)
    : [];

  useEffect(() => {
    if (!loading && !scrolledToChat.current && window.location.hash === "#match-chat") {
      document.getElementById("match-chat")?.scrollIntoView({ block: "start" });
      scrolledToChat.current = true;
    }
  }, [loading]);

  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (!lastMessageId || !stickToBottom.current) return;
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }, [lastMessageId]);

  const reload = useCallback(async () => {
    if (reloadLock.current || sending.current) return;
    reloadLock.current = true;
    const version = epoch.current;
    try {
      const page = await fetchMatchChat(slug, matchId, token);
      if (version !== epoch.current) return;
      setMessages((old) => mergeMessages(old, page.messages));
      setTargets(page.targets);
      setNextCursor((old) => old ?? page.nextCursor);
      setError(false); setLoading(false);
    } catch (cause) {
      if (version !== epoch.current) return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        setMessages([]); setTargets([]); setNextCursor(null);
      }
      setError(true); setLoading(false);
    } finally { if (version === epoch.current) reloadLock.current = false; }
  }, [slug, matchId, token]);
  useEffect(() => {
    epoch.current += 1;
    reloadLock.current = false; sending.current = false; setBusy(false); setOlderBusy(false); setCooldown(false);
    stickToBottom.current = true;
    setMessages([]); setTargets([]); setText(""); setMentions([]); setActiveMention(null); setNextCursor(null); setLoading(true); setError(false);
    void reload();
    const socket = io(new URL("/tournament-rooms", publicEnv.apiBaseUrl).toString(), { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.timeout(8000).emit("join_match", { slug, matchId }, (cause: unknown, ack: { ok?: boolean } | undefined) => {
      connected.current = !cause && ack?.ok === true;
      if (connected.current) void reload();
    }));
    socket.on("disconnect", () => { connected.current = false; });
    socket.on("match_changed", () => { if (document.visibilityState === "visible") void reload(); });
    const timer = window.setInterval(() => { if (!connected.current && document.visibilityState === "visible") void reload(); }, 15_000);
    const visible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", visible);
    return () => { epoch.current += 1; connected.current = false; socket.disconnect(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [slug, matchId, token, reload]);

  async function older() {
    if (!nextCursor || olderBusy || messages.length >= 200) return;
    const version = epoch.current; setOlderBusy(true);
    const previousHeight = listRef.current?.scrollHeight ?? 0;
    const previousTop = listRef.current?.scrollTop ?? 0;
    try {
      const page = await fetchMatchChat(slug, matchId, token, nextCursor);
      if (version !== epoch.current) return;
      setMessages((old) => mergeMessages(page.messages, old)); setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (list) list.scrollTop = previousTop + list.scrollHeight - previousHeight;
      });
    } catch { if (version === epoch.current) setError(true); }
    finally { if (version === epoch.current) setOlderBusy(false); }
  }

  function updateText(value: string, caret: number) {
    setText(value);
    setActiveMention(findActiveMention(value, caret, targets.filter((target) => mentions.includes(target.userId))));
    setActiveSuggestion(0);
    setMentions((old) => old.filter((id) => {
      const player = targets.find((target) => target.userId === id);
      return !!player && value.includes(`@${player.displayName}`);
    }));
  }

  function openMentionPicker() {
    const textarea = textareaRef.current;
    if (!textarea || mentions.length >= 5) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = text.slice(0, start) + "@" + text.slice(end);
    setText(next);
    setActiveMention({ start, end: start + 1, query: "" });
    setActiveSuggestion(0);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1);
    });
  }

  function insertMention(player: MatchPlayer) {
    if (!activeMention || mentions.length >= 5) return;
    const insertion = `@${player.displayName} `;
    const next = text.slice(0, activeMention.start) + insertion + text.slice(activeMention.end);
    const caret = activeMention.start + insertion.length;
    setText(next);
    setMentions((old) => old.includes(player.userId) ? old : [...old, player.userId]);
    setActiveMention(null);
    setActiveSuggestion(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  function onMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      if (activeMention && suggestions.length > 0) {
        event.preventDefault();
        const player = suggestions[activeSuggestion] ?? suggestions[0];
        if (player) insertMention(player);
        return;
      }
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    if (!activeMention || suggestions.length === 0) {
      if (event.key === "Escape") setActiveMention(null);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((old) => (old + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((old) => (old + suggestions.length - 1) % suggestions.length);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActiveMention(null);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !text.trim()) return;
    const version = epoch.current; sending.current = true; setBusy(true); setError(false); setCooldown(false);
    try {
      const message = await sendMatchChat(slug, matchId, token, text.trim(), mentions);
      if (version !== epoch.current) return;
      setMessages((old) => mergeMessages(old, [message])); setText(""); setMentions([]); setActiveMention(null);
      stickToBottom.current = true;
      setCooldown(message.mentions.some((item) => !item.notified));
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
    } catch { if (version === epoch.current) setError(true); }
    finally { if (version === epoch.current) { sending.current = false; setBusy(false); } }
  }

  return <section className={styles.panel} id="match-chat">
    <header className={styles.panelHeader}>
      <h2>{t("dota.tournaments.matchChat.title")}</h2>
      <p className={styles.muted}>{t("dota.tournaments.matchChat.audience")}</p>
    </header>
    {loading ? <p className={styles.muted}>{t("common.loadingEllipsis")}</p> : null}
    {nextCursor && messages.length < 200 ? <button className="button-secondary" type="button" onClick={() => void older()} disabled={olderBusy}>
      {t("dota.tournaments.matchChat.older")}</button> : null}
    <div className={styles.messages} ref={listRef} aria-live="polite" onScroll={() => {
      const list = listRef.current;
      if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    }}>
      {messages.map((message) => <article className={styles.message} key={message.id}>
        <header><strong>{message.displayName}</strong><time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></header>
        <p>{renderMessage(message)}</p>
      </article>)}
      {!loading && !messages.length && !error ? <p className={styles.muted}>{t("dota.tournaments.matchChat.empty")}</p> : null}
    </div>
    <form onSubmit={(event) => void send(event)}>
      <label className={styles.label}>{t("dota.tournaments.matchChat.message")}
        <div className={styles.composer}>
          <textarea
            ref={textareaRef}
            aria-autocomplete="list"
            aria-controls={suggestionListId}
            aria-expanded={suggestions.length > 0}
            aria-activedescendant={suggestions[activeSuggestion] ? `${suggestionListId}-${activeSuggestion}` : undefined}
            maxLength={4000}
            rows={3}
            value={text}
            onChange={(event) => updateText(event.target.value, event.target.selectionStart)}
            onKeyDown={onMessageKeyDown}
            onClick={(event) => setActiveMention(findActiveMention(text, event.currentTarget.selectionStart, targets.filter((target) => mentions.includes(target.userId))))}
            disabled={busy || loading}
            required
          />
          {activeMention && mentions.length < 5 && targets.length ? <div className={styles.suggestions} id={suggestionListId} role="listbox" aria-label={t("dota.tournaments.matchChat.mention")}>
            {suggestions.length ? suggestions.map((player, index) => <button
              aria-selected={index === activeSuggestion}
              className={index === activeSuggestion ? styles.suggestionActive : styles.suggestion}
              id={`${suggestionListId}-${index}`}
              key={player.userId}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertMention(player)}
              role="option"
              type="button"
            ><span>{player.displayName}</span><small>{t("dota.tournaments.matchChat.player")}</small></button>)
              : <p className={styles.noSuggestions}>{t("dota.tournaments.matchChat.noPlayers")}</p>}
          </div> : null}
          <button
            aria-label={t("dota.tournaments.matchChat.mention")}
            className={styles.mentionTrigger}
            disabled={busy || loading || mentions.length >= 5 || targets.length === 0}
            onClick={openMentionPicker}
            type="button"
          >@</button>
        </div>
      </label>
      <button className="button-primary" type="submit" disabled={busy || loading || !text.trim()}>{t("dota.tournaments.matchChat.send")}</button>
    </form>
    {cooldown ? <p className={styles.muted}>{t("dota.tournaments.matchChat.cooldown")}</p> : null}
    {error ? <p className={styles.error} role="alert">{t("dota.tournaments.matchChat.error")}</p> : null}
  </section>;
}

function findActiveMention(value: string, caret: number, selectedTargets: MatchPlayer[] = []): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  const start = beforeCaret.lastIndexOf("@");
  if (start < 0) return null;
  const previous = beforeCaret[start - 1];
  if (previous && !/\s|\(|\[|\{/.test(previous)) return null;
  const query = beforeCaret.slice(start + 1);
  if (/\n/.test(query) || /\s$/.test(query)) return null;
  const selectedToken = selectedTargets.some((target) => {
    const token = `@${target.displayName}`;
    const tail = beforeCaret.slice(start);
    return tail === token || tail.startsWith(token + " ") || tail.startsWith(token + "\n");
  });
  if (selectedToken) return null;
  return { start, end: caret, query };
}

function renderMessage(message: MatchChatMessage): ReactNode[] {
  const mentions = message.mentions
    .map((mention) => ({ label: `@${mention.displayName}`, userId: mention.userId }))
    .sort((a, b) => b.label.length - a.label.length);
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < message.message.length) {
    const next = mentions
      .map((mention) => ({ ...mention, start: message.message.indexOf(mention.label, cursor) }))
      .filter((mention) => mention.start >= 0)
      .sort((a, b) => a.start - b.start || b.label.length - a.label.length)[0];
    if (!next) break;
    if (next.start > cursor) parts.push(message.message.slice(cursor, next.start));
    const end = next.start + next.label.length;
    parts.push(<mark key={`${next.userId}-${next.start}`}>{message.message.slice(next.start, end)}</mark>);
    cursor = end;
  }
  if (cursor < message.message.length) parts.push(message.message.slice(cursor));
  return parts;
}

function mergeMessages(a: MatchChatMessage[], b: MatchChatMessage[]) {
  return [...new Map([...a, ...b].map((message) => [message.id, message])).values()]
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id)).slice(-200);
}
