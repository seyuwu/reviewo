"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { io } from "socket.io-client";
import { publicEnv } from "../../../lib/config/public-env";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorCode } from "../../../lib/api/read-api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchMyDotaProfile } from "../../dota/api/dota-api";
import type { DotaProfile } from "../../dota/types/dota";
import { fetchFriends, fetchFriendRequests, sendFriendRequest } from "../../social/api/social-api";
import { openDiscordPartyVoice } from "../../social/lib/discord-invite";
import { getDiscordLinkUrl } from "../../profile/api/profile";
import {
  assignDotaTournamentEntryPosition, decideDotaTournamentJoinRequest,
  fetchDotaTournamentManagedEntries, joinDotaTournamentEntry, leaveDotaTournamentEntry,
  setDotaTournamentEntryJoinMode, withdrawDotaTeamFromTournament
} from "../api/dota-tournaments-api";
import {
  ensureTournamentRoomVoice, fetchTournamentRoom, fetchTournamentRoomMessages,
  leaveTournamentAfterparty, removeTournamentRoomMember, sendTournamentRoomMessage, tournamentRoomUrl,
  updateTournamentRoomDescription
} from "../api/tournament-rooms-api";
import type { DotaTournamentManagedEntry } from "../types/dota-tournament";
import type { TournamentRoom, TournamentRoomMessage } from "../types/tournament-room";
import { formatDate } from "./dota-tournaments-view";
import styles from "./dota-tournament-squad-view.module.css";

const ROLES = ["1", "2", "3", "4", "5"] as const;

export function DotaTournamentSquadView({ slug, entryId }: { slug: string; entryId: string }) {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const token = authSession?.accessToken;
  const [room, setRoom] = useState<TournamentRoom | null>(null);
  const [managed, setManaged] = useState<DotaTournamentManagedEntry | null>(null);
  const [profile, setProfile] = useState<DotaProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [messages, setMessages] = useState<TournamentRoomMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionBusy, setDescriptionBusy] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [descriptionSaved, setDescriptionSaved] = useState(false);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [friendStates, setFriendStates] = useState<Record<string, "friends" | "sent">>({});
  const [now, setNow] = useState(Date.now());
  const roomRef = useRef<TournamentRoom | null>(null);
  const reloadInFlight = useRef<Promise<void> | null>(null);
  const loadedOlder = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const connected = useRef(false);
  const alive = useRef(true);
  const requestEpoch = useRef(0);
  const serverOffset = useRef(0);

  const mergeMessages = useCallback((items: TournamentRoomMessage[]) => {
    setMessages((previous) => Array.from(new Map([...previous, ...items].map((item) => [item.id, item])).values())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
  }, []);

  const reload = useCallback((): Promise<void> => {
    if (reloadInFlight.current) return reloadInFlight.current;
    const epoch = requestEpoch.current;
    const request = (async () => {
      try {
        const next = await fetchTournamentRoom(slug, entryId, token);
        if (!alive.current || epoch !== requestEpoch.current) return;
        roomRef.current = next;
        setRoom(next);
        setNow(Date.parse(next.serverNow));
        serverOffset.current = Date.parse(next.serverNow) - Date.now();
        if (next.canReadChat && token) {
          const page = await fetchTournamentRoomMessages(slug, entryId, token);
          if (!alive.current || epoch !== requestEpoch.current) return;
          mergeMessages(page.messages);
          if (!loadedOlder.current) setCursor(page.nextCursor);
        } else {
          setMessages([]);
          setCursor(null);
        }
        if (next.isCaptain && next.canManageRoster && token) {
          const items = await fetchDotaTournamentManagedEntries(slug, token);
          if (alive.current && epoch === requestEpoch.current) setManaged(items.find((entry) => entry.entryId === entryId) ?? null);
        } else setManaged(null);
        if (alive.current && epoch === requestEpoch.current) setError(null);
      } catch (cause) {
        if (!alive.current || epoch !== requestEpoch.current) return;
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
          setMessages([]);
          setManaged(null);
          setRoom((previous) => previous ? { ...previous, isMember: false, canReadChat: false, canWriteChat: false, canLeave: false, canEditDescription: false } : null);
        }
        setError(t("dota.tournaments.room.actionError"));
      } finally { if (alive.current && epoch === requestEpoch.current) setLoading(false); }
    })();
    reloadInFlight.current = request;
    void request.finally(() => { if (reloadInFlight.current === request) reloadInFlight.current = null; });
    return request;
  }, [slug, entryId, token, mergeMessages, t]);

  useEffect(() => {
    requestEpoch.current++;
    alive.current = true;
    reloadInFlight.current = null;
    roomRef.current = null;
    loadedOlder.current = false;
    stickToBottom.current = true;
    setRoom(null);
    setCursor(null);
    setText("");
    setDescriptionDraft("");
    setDescriptionEditing(false);
    setDescriptionBusy(false);
    setDescriptionError(null);
    setDescriptionSaved(false);
    setFeedback(null);
    setBusy(false);
    setMessages([]);
    setManaged(null);
    setLoading(true);
    setError(null);
    if (isAuthSessionLoaded) void reload();
    return () => { alive.current = false; requestEpoch.current++; };
  }, [isAuthSessionLoaded, reload]);

  useEffect(() => {
    setProfile(null);
    setFriendStates({});
    if (!token) { setProfileLoading(false); return; }
    setProfileLoading(true);
    let active = true;
    void fetchMyDotaProfile(token).then((value) => { if (active) setProfile(value); }).catch(() => { if (active) setProfile(null); }).finally(() => { if (active) setProfileLoading(false); });
    void Promise.all([fetchFriends(token), fetchFriendRequests(token)]).then(([friends, requests]) => {
      if (!active) return;
      setFriendStates(Object.fromEntries([
        ...friends.friends.map((friend) => [friend.id, "friends"]),
        ...requests.outgoing.map((request) => [request.otherUser.id, "sent"]),
        ...requests.incoming.map((request) => [request.otherUser.id, "sent"])
      ]));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !room?.canReadChat) return;
    const socket = io(new URL("/tournament-rooms", publicEnv.apiBaseUrl).toString(), {
      auth: { token }, transports: ["websocket", "polling"]
    });
    socket.on("connect", () => {
      socket.timeout(8000).emit("join", { slug, entryId }, (cause: unknown, ack: { ok?: boolean } | undefined) => {
        connected.current = !cause && ack?.ok === true;
        if (connected.current) void reload();
      });
    });
    socket.on("disconnect", () => { connected.current = false; });
    socket.on("changed", () => { if (document.visibilityState === "visible") void reload(); });
    return () => { connected.current = false; socket.disconnect(); };
  }, [token, room?.canReadChat, slug, entryId, reload]);

  useEffect(() => {
    const focus = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    let tick = 0;
    const timer = window.setInterval(() => {
      setNow(Date.now() + serverOffset.current);
      tick++;
      if (document.visibilityState !== "visible" || roomRef.current?.phase === "CLOSED") return;
      const expired = roomRef.current?.phase === "AFTERPARTY" &&
        Date.parse(roomRef.current.expiresAt!) <= Date.now() + serverOffset.current;
      if (tick % 3 === 0 || !connected.current || expired) void reload();
    }, 10000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [reload]);

  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (stickToBottom.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lastMessageId, loading, room?.canReadChat]);

  async function action(work: () => Promise<unknown>, success?: string) {
    if (busy) return;
    const epoch = requestEpoch.current;
    setBusy(true); setError(null); setFeedback(null);
    try {
      await work();
      if (!alive.current || epoch !== requestEpoch.current) return;
      if (success) setFeedback(success);
      await reload();
    }
    catch { if (alive.current && epoch === requestEpoch.current) setError(t("dota.tournaments.room.actionError")); }
    finally { if (alive.current && epoch === requestEpoch.current) setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!token || !text.trim() || busy || !room?.canWriteChat) return;
    const body = text.trim();
    const epoch = requestEpoch.current;
    await action(async () => {
      const item = await sendTournamentRoomMessage(slug, entryId, token, body);
      if (!alive.current || epoch !== requestEpoch.current) return;
      stickToBottom.current = true;
      mergeMessages([item]); setText("");
    });
  }
  async function voice(intent: "create" | "join", allowLink = true) {
    if (!token || busy) return;
    const epoch = requestEpoch.current;
    const current = () => alive.current && epoch === requestEpoch.current;
    setBusy(true); setError(null);
    try {
      const result = await ensureTournamentRoomVoice(slug, entryId, token, intent);
      if (!current()) return;
      await reload();
      if (!current()) return;
      if (intent === "join") openDiscordPartyVoice(result);
      else setFeedback(t("dota.tournaments.room.voiceReady"));
    } catch (cause) {
      if (!current()) return;
      if (allowLink && cause instanceof ApiError && readApiErrorCode(cause.body) === "DISCORD_NOT_LINKED") {
        try {
          sessionStorage.setItem("fdp.tournamentVoice:" + entryId, "join");
          const result = await getDiscordLinkUrl(token, window.location.pathname, window.location.origin);
          if (!current()) { sessionStorage.removeItem("fdp.tournamentVoice:" + entryId); return; }
          window.location.assign(result.url);
          return;
        } catch { sessionStorage.removeItem("fdp.tournamentVoice:" + entryId); }
      }
      setError(t("dota.team.discordVoiceError"));
    } finally { if (current()) setBusy(false); }
  }
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  useEffect(() => {
    if (token && room?.isMember && sessionStorage.getItem("fdp.tournamentVoice:" + entryId)) {
      sessionStorage.removeItem("fdp.tournamentVoice:" + entryId);
      void voiceRef.current("join", false);
    }
  }, [token, room?.isMember, entryId]); // Resume a deliberate voice join after Discord OAuth.

  async function older() {
    if (!cursor || !token || busy) return;
    const epoch = requestEpoch.current;
    await action(async () => {
      const previousHeight = logRef.current?.scrollHeight ?? 0;
      const previousTop = logRef.current?.scrollTop ?? 0;
      const page = await fetchTournamentRoomMessages(slug, entryId, token, cursor);
      if (!alive.current || epoch !== requestEpoch.current) return;
      loadedOlder.current = true;
      mergeMessages(page.messages); setCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = previousTop + logRef.current.scrollHeight - previousHeight;
      });
    });
  }
  async function copyInvite() {
    await action(async () => {
      await navigator.clipboard.writeText(window.location.origin + tournamentRoomUrl(slug, entryId));
    }, t("dota.tournaments.inviteCopied"));
  }

  function editDescription() {
    setDescriptionDraft(room?.description ?? "");
    setDescriptionError(null);
    setDescriptionSaved(false);
    setDescriptionEditing(true);
  }

  async function saveDescription(event: FormEvent) {
    event.preventDefault();
    if (!token || !room?.canEditDescription || descriptionBusy) return;
    const epoch = requestEpoch.current;
    setDescriptionBusy(true);
    setDescriptionError(null);
    setDescriptionSaved(false);
    try {
      const result = await updateTournamentRoomDescription(slug, entryId, token, descriptionDraft);
      if (!alive.current || epoch !== requestEpoch.current) return;
      setRoom((previous) => previous ? { ...previous, description: result.description } : null);
      setDescriptionEditing(false);
      setDescriptionSaved(true);
    } catch {
      if (alive.current && epoch === requestEpoch.current)
        setDescriptionError(t("dota.tournaments.room.descriptionError"));
    } finally {
      if (alive.current && epoch === requestEpoch.current) setDescriptionBusy(false);
    }
  }

  const own = room?.members.find((member) => member.userId === authSession?.userId);
  const available = ROLES.filter((candidate) => profile?.roles.includes(candidate) &&
    !room?.members.some((member) => member.positionRole === candidate && member.userId !== authSession?.userId));
  const selectedRole = available.includes(role as typeof ROLES[number]) ? role
    : available.includes(own?.positionRole as typeof ROLES[number]) ? own!.positionRole!
    : available[0] || "";
  const roleName = (position: string) => t(("dota.position." + position) as never);
  const remaining = room?.expiresAt ? Math.max(0, Date.parse(room.expiresAt) - now) : 0;
  const remainingLabel = Math.floor(remaining / 3600000) + ":" + String(Math.floor(remaining / 60000) % 60).padStart(2, "0");

  if (loading) return <section className={styles.page}><p>{t("common.loadingEllipsis")}</p></section>;
  if (!room) return <section className={styles.page}><Link className={styles.back} href={"/games/tournaments/" + encodeURIComponent(slug)}><span aria-hidden="true">←</span>{t("common.back")}</Link><p role="alert">{error ?? t("dota.tournaments.loadError")}</p></section>;
  return (
    <section className={styles.page}>
      <Link className={styles.back} href={"/games/tournaments/" + encodeURIComponent(slug)}><span aria-hidden="true">←</span><span>{room.tournament.title}</span></Link>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>{t(room.phase === "AFTERPARTY" ? "dota.tournaments.room.afterparty" : "dota.tournaments.room.team")}</p>
          <h1>{room.name}</h1><p>{room.status === "RESERVE" ? t("dota.tournaments.reserveStatus") + " · " : ""}{t("dota.tournaments.rosterCount", { current: String(room.members.filter((member) => !member.hasLeft).length), max: "5" })}{room.phase === "TOURNAMENT" ? " · " + t(room.joinMode === "OPEN" ? "dota.tournaments.openJoin" : "dota.tournaments.requestJoin") : ""}</p>
          {room.status === "RESERVE" ? <p className={styles.hint}>{t("dota.tournaments.reserveHint")}</p> : null}
        </div>
        {room.isMember ? <div className={styles.actions}>
          <button className="button-primary" disabled={busy} onClick={() => void voice(room.voice ? "join" : "create")}>{t(room.voice ? "dota.tournaments.room.joinVoice" : "dota.tournaments.room.createVoice")}</button>
          {room.phase === "TOURNAMENT" && room.canManageRoster ? <button className="button-secondary" disabled={busy} onClick={() => void copyInvite()}>{t("dota.tournaments.inviteSquad")}</button> : null}
        </div> : null}
      </header>
      {room.phase === "AFTERPARTY" ? <div className={styles.notice}>
        <strong>{t("dota.tournaments.room.afterpartyTime", { time: remainingLabel })}</strong>
        <p>{t("dota.tournaments.room.afterpartyHint")}</p>
      </div> : room.phase === "CLOSED" ? <div className={styles.notice}><strong>{t("dota.tournaments.room.closed")}</strong><p>{t("dota.tournaments.room.closedHint")}</p></div> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {feedback ? <p className={styles.success} role="status">{feedback}</p> : null}
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <section className={styles.panel}><h2>{t("dota.tournaments.room.roster")}</h2>
            <ul className={styles.roster}>{ROLES.map((position) => {
              const member = room.members.find((item) => item.positionRole === position);
              return <li key={position} className={member?.hasLeft ? styles.left : undefined}>
                <span className={styles.position}>{position}</span>
                <div className={styles.player}><small>{roleName(position)}</small>
                  {member?.dotaProfileSlug ? <Link href={"/dota/" + encodeURIComponent(member.dotaProfileSlug)}>{member.displayName}</Link> : member?.displayName ?? t("dota.tournaments.freePosition")}
                  {member ? <span>{member.mmr ?? "—"} MMR{member.hasLeft ? " · " + t("dota.tournaments.room.left") : ""}</span> : null}
                  {member?.userId && member.userId !== authSession?.userId && room.isMember ? <div className={styles.memberActions}>
                    <button className="button-secondary" disabled={busy || !!friendStates[member.userId]} onClick={() => void action(async () => {
                      await sendFriendRequest(member.userId!, token!);
                      setFriendStates((previous) => ({ ...previous, [member.userId!]: "sent" }));
                    })}>{t(friendStates[member.userId] === "friends" ? "dota.tournaments.room.friends" : friendStates[member.userId] ? "dota.tournaments.room.friendSent" : "dota.tournaments.room.addFriend")}</button>
                    {room.isCaptain && room.canManageRoster ? <button className={styles.remove} disabled={busy} onClick={() => void action(() => removeTournamentRoomMember(slug, entryId, member.userId!, token!))}>{t("dota.tournaments.room.remove")}</button> : null}
                  </div> : null}
                </div>
              </li>;
            })}{room.members.filter((member) => !member.positionRole).map((member, index) => <li key={"unassigned-" + index}><span className={styles.position}>—</span><div className={styles.player}>
              {member.dotaProfileSlug ? <Link href={"/dota/" + encodeURIComponent(member.dotaProfileSlug)}>{member.displayName}</Link> : member.displayName}
              <small>{t("dota.tournaments.unassignedPosition")}</small>
            </div></li>)}</ul>
            {room.canManageRoster && own && available.length ? <form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); void action(() => assignDotaTournamentEntryPosition(slug, entryId, selectedRole as typeof ROLES[number], token!)); }}>
              <label>{t("dota.tournaments.selectPosition")}<select value={selectedRole} onChange={(event) => setRole(event.target.value)}>{available.map((position) => <option key={position} value={position}>{roleName(position)}</option>)}</select></label>
              <button className="button-secondary" disabled={busy || selectedRole === own.positionRole}>{t("dota.team.renameSave")}</button>
            </form> : null}
          </section>
          {room.canJoin && !token ? <Link className="button-primary" href="/profile">{t("dota.tournaments.signInToJoin")}</Link> : room.canJoin && !profile && !profileLoading ? <Link className="button-primary" href="/dota/create">{t("dota.tournaments.createProfileToJoin")}</Link> : room.canJoin && profile && !room.pendingEntryId ? <form className={styles.panel} onSubmit={(event) => {
            event.preventDefault(); if (!selectedRole || !token) return;
            void action(async () => {
              const result = await joinDotaTournamentEntry(slug, entryId, selectedRole as typeof ROLES[number], token);
              if (result.result === "REQUESTED") setFeedback(t("dota.tournaments.room.requestSent"));
            });
          }}><label>{t("dota.tournaments.selectPosition")}<select value={selectedRole} onChange={(event) => setRole(event.target.value)}>{available.map((position) => <option key={position} value={position}>{roleName(position)}</option>)}</select></label>
            <button className="button-primary" disabled={busy || !available.length}>{t(room.joinMode === "OPEN" ? "dota.tournaments.joinTeam" : "dota.tournaments.applyToTeam")}</button>
          </form> : null}
          {!room.isMember && room.phase === "TOURNAMENT" && room.currentEntryId ? <div className={styles.notice}><p>{t("dota.tournaments.room.alreadyMember")}</p><Link className={styles.noticeLink} href={tournamentRoomUrl(slug, room.currentEntryId)}>{t("dota.tournaments.room.myTeam")}<span aria-hidden="true">→</span></Link></div> : null}
          {!room.isMember && room.pendingEntryId ? <div className={styles.notice}><p>{t("dota.tournaments.room.requestSent")}</p><Link className={styles.noticeLink} href={tournamentRoomUrl(slug, room.pendingEntryId)}>{t("dota.tournaments.room.openRequest")}<span aria-hidden="true">→</span></Link></div> : null}
          {managed ? <section className={styles.panel}><h2>{t("dota.tournaments.room.management")}</h2>
            <label>{t("dota.tournaments.teamJoinMode")}<select value={room.joinMode} disabled={busy} onChange={(event) => void action(() => setDotaTournamentEntryJoinMode(slug, entryId, event.target.value as "OPEN" | "CONFIRM", token!))}><option value="OPEN">{t("dota.tournaments.openJoin")}</option><option value="CONFIRM">{t("dota.tournaments.requestJoin")}</option></select></label>
            {managed.requests.length ? managed.requests.map((request) => <div className={styles.request} key={request.id}><strong>{request.displayName}</strong><small>{roleName(request.positionRole)} · {request.mmr ?? "—"} MMR</small><div className={styles.actions}>
              <button className="button-primary" disabled={busy} onClick={() => void action(() => decideDotaTournamentJoinRequest(slug, entryId, request.id, "ACCEPT", token!))}>{t("dota.tournaments.acceptRequest")}</button>
              <button className="button-secondary" disabled={busy} onClick={() => void action(() => decideDotaTournamentJoinRequest(slug, entryId, request.id, "DECLINE", token!))}>{t("dota.tournaments.declineRequest")}</button>
            </div></div>) : <p className={styles.hint}>{t("dota.tournaments.noPendingRequests")}</p>}
            <button className="button-secondary" disabled={busy} onClick={() => void action(() => withdrawDotaTeamFromTournament(slug, entryId, token!))}>{t("dota.tournaments.withdrawSquad")}</button>
          </section> : null}
          {room.canLeave ? <div className={styles.panel}>
            {room.isCaptain && room.phase === "TOURNAMENT" ? <p className={styles.hint}>{t("dota.tournaments.room.captainLeaveHint")}</p> : null}
            <button className="button-secondary" disabled={busy} onClick={() => void action(() => room.phase === "AFTERPARTY" ? leaveTournamentAfterparty(slug, entryId, token!) : leaveDotaTournamentEntry(slug, entryId, token!))}>{t("dota.tournaments.room.leave")}</button>
          </div> : null}
        </aside>
        <div className={styles.content}>
          <section className={`${styles.panel} ${styles.descriptionPanel}`} aria-labelledby="tournament-team-description-title">
            <div className={styles.descriptionTop}>
              <h2 id="tournament-team-description-title">{t("dota.tournaments.room.descriptionTitle")}</h2>
              {room.canEditDescription && !descriptionEditing ? <button type="button" className="button-secondary" onClick={editDescription}>
                {t(room.description ? "dota.tournaments.room.descriptionEdit" : "dota.tournaments.room.descriptionAdd")}
              </button> : null}
            </div>
            {room.canEditDescription && descriptionEditing ? <form className={styles.descriptionForm} onSubmit={(event) => void saveDescription(event)}>
              <textarea aria-labelledby="tournament-team-description-title" rows={4} maxLength={1000}
                placeholder={t("dota.tournaments.room.descriptionPlaceholder")} value={descriptionDraft}
                disabled={descriptionBusy} onChange={(event) => { setDescriptionDraft(event.target.value); setDescriptionError(null); }} />
              <div className={styles.descriptionControls}>
                <span className={styles.hint}>{descriptionDraft.length} / 1000</span>
                <div className={styles.actions}>
                  <button type="button" className="button-secondary" disabled={descriptionBusy} onClick={() => { setDescriptionEditing(false); setDescriptionError(null); }}>
                    {t("dota.tournaments.room.descriptionCancel")}
                  </button>
                  <button className="button-primary" disabled={descriptionBusy || descriptionDraft.trim() === (room.description ?? "")}>
                    {t(descriptionBusy ? "dota.tournaments.room.descriptionSaving" : "dota.tournaments.room.descriptionSave")}
                  </button>
                </div>
              </div>
            </form> : <p className={room.description ? styles.descriptionText : styles.hint}>
              {room.description || t(room.canEditDescription ? "dota.tournaments.room.descriptionPlaceholder" : "dota.tournaments.room.descriptionEmpty")}
            </p>}
            {descriptionError ? <p className={styles.descriptionError} role="alert">{descriptionError}</p> : null}
            {descriptionSaved ? <p className={styles.descriptionSaved} role="status">{t("dota.tournaments.room.descriptionSaved")}</p> : null}
          </section>
        <section className={styles.chatPanel}>
          <div className={styles.chatTop}><h2>{t("dota.tournaments.room.chat")}</h2><span>{t(room.canReadChat && !room.isMember ? "dota.tournaments.room.staffWrite" : "dota.tournaments.room.chatPrivate")}</span></div>
          {room.canReadChat ? <>
            <div className={styles.log} ref={logRef} role="log" aria-live="polite" onScroll={() => {
              const log = logRef.current; if (log) stickToBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
            }}>
              {cursor ? <button className="button-secondary" disabled={busy} onClick={() => void older()}>{t("dota.tournaments.room.older")}</button> : null}
              {!messages.length ? <p className={styles.chatEmpty}>{t("dota.tournaments.room.chatEmpty")}</p> : messages.map((message) => (
                <article className={message.senderUserId === authSession?.userId ? styles.ownMessage : styles.message} key={message.id}>
                  <div><strong>{message.senderName}</strong><time dateTime={message.createdAt} title={formatDate(message.createdAt)}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
                  <p>{message.body.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</p>
                </article>
              ))}
            </div>
            {room.canWriteChat ? <form className={styles.composer} onSubmit={(event) => void send(event)}>
              <label className={styles.srOnly} htmlFor="tournament-chat-message">{t("dota.tournaments.room.message")}</label>
              <textarea id="tournament-chat-message" rows={2} value={text} maxLength={10000} disabled={busy} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }} placeholder={t("dota.tournaments.room.message")} />
              <button className="button-primary" disabled={busy || !text.trim()}>{t("dota.tournaments.room.send")}</button>
            </form> : null}
          </> : <div className={styles.chatEmpty}><span aria-hidden="true">💬</span><h3>{t("dota.tournaments.room.chatLocked")}</h3><p>{t(room.phase === "CLOSED" ? "dota.tournaments.room.closedHint" : "dota.tournaments.room.chatLockedHint")}</p></div>}
        </section>
        </div>
      </div>
    </section>
  );
}
