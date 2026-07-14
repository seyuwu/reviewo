"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DOTA_PARTY_SIZE, DOTA_TEMP_PARTY_TTL_HOURS } from "@reviewo/shared";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createGameParty,
  fetchFriends,
  fetchGameParty,
  fetchPartyChatMessages,
  inviteFriendToParty,
  leaveGameParty,
  renameGameParty,
  sendPartyChatMessage
} from "../../social/api/social-api";
import type {
  FriendUser,
  GameParty,
  GamePartyChatMessage,
  GamePartyKind
} from "../../social/types/social";
import { buildDotaTeamUrl, copyDotaTeamShareText } from "../lib/share";
import styles from "./dota-team-view.module.css";

interface DotaTeamViewProps {
  party: GameParty;
}

function formatExpiry(expiresAt: string | null, t: ReturnType<typeof useTranslation>): string | null {
  if (!expiresAt) {
    return null;
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return t("dota.team.expiresAt", { time: date.toLocaleString() });
}

export function DotaTeamView({ party: initialParty }: DotaTeamViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [party, setParty] = useState(initialParty);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [chatMessages, setChatMessages] = useState<GamePartyChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [renameDraft, setRenameDraft] = useState(initialParty.name);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    setParty(initialParty);
    setRenameDraft(initialParty.name);
  }, [initialParty]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    let cancelled = false;

    void fetchGameParty(initialParty.slug, authSession.accessToken)
      .then((refreshed) => {
        if (!cancelled) {
          setParty(refreshed);
          setRenameDraft(refreshed.name);
        }
      })
      .catch(() => {
        // Keep SSR payload if refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, initialParty.slug]);

  useEffect(() => {
    if (!authSession?.accessToken || !party.isOwner) {
      return;
    }

    let cancelled = false;

    void fetchFriends(authSession.accessToken)
      .then((response) => {
        if (!cancelled) {
          setFriends(response.friends);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFriends([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, party.isOwner]);

  useEffect(() => {
    if (!authSession?.accessToken || !party.isMember) {
      setChatMessages([]);
      return;
    }

    let cancelled = false;

    void fetchPartyChatMessages(party.slug, authSession.accessToken)
      .then((page) => {
        if (!cancelled) {
          setChatMessages(page.messages);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatMessages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, party.isMember, party.slug]);

  const memberIds = new Set(party.members.map((member) => member.userId));
  const inviteCandidates = friends.filter((friend) => !memberIds.has(friend.id));
  const emptySlots = Array.from({ length: Math.max(0, party.openSlots) });
  const expiryLabel = formatExpiry(party.expiresAt, t);
  const kindLabel =
    party.kind === "PARTY" ? t("dota.team.kindParty") : t("dota.team.kindTeam");

  async function handleInvite(userId: string) {
    if (!authSession?.accessToken) {
      return;
    }

    setError(null);
    setPending(true);

    try {
      await inviteFriendToParty(party.slug, userId, authSession.accessToken);
      const refreshed = await fetchGameParty(party.slug, authSession.accessToken);
      setParty(refreshed);
    } catch {
      setError(t("dota.team.inviteError"));
    } finally {
      setPending(false);
    }
  }

  async function handleShare() {
    const ok = await copyDotaTeamShareText(party, t);
    setCopied(ok);

    if (ok) {
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function handleLeave() {
    if (!authSession?.accessToken) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      await leaveGameParty(party.slug, authSession.accessToken);
      router.push("/dota");
    } catch {
      setError(t("dota.team.leaveError"));
      setPending(false);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authSession?.accessToken || renameDraft.trim().length < 2) {
      return;
    }

    setRenaming(true);
    setError(null);

    try {
      const updated = await renameGameParty(
        party.slug,
        renameDraft.trim(),
        authSession.accessToken
      );
      setParty(updated);
      setRenameDraft(updated.name);
    } catch {
      setError(t("dota.team.renameError"));
    } finally {
      setRenaming(false);
    }
  }

  async function handleSendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authSession?.accessToken || chatDraft.trim().length === 0) {
      return;
    }

    setChatPending(true);
    setChatError(null);

    try {
      const created = await sendPartyChatMessage(
        party.slug,
        chatDraft.trim(),
        authSession.accessToken
      );
      setChatMessages((current) => [...current, created]);
      setChatDraft("");
    } catch {
      setChatError(t("dota.team.chatSendError"));
    } finally {
      setChatPending(false);
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{kindLabel}</p>
        <h1>{party.name}</h1>
        <p className={styles.lead}>
          {t("dota.team.lead", {
            current: String(party.memberCount),
            max: String(party.maxMembers)
          })}
        </p>
        {expiryLabel ? <p className={styles.lead}>{expiryLabel}</p> : null}
        {party.isOwner ? (
          <form className={styles.renameForm} onSubmit={handleRename}>
            <label className="field-label">
              {t("dota.team.renameLabel")}
              <input
                maxLength={80}
                minLength={2}
                onChange={(event) => setRenameDraft(event.target.value)}
                value={renameDraft}
              />
            </label>
            <button
              className="button-secondary"
              disabled={renaming || renameDraft.trim().length < 2 || renameDraft.trim() === party.name}
              type="submit"
            >
              {renaming ? t("common.loadingEllipsis") : t("dota.team.renameCta")}
            </button>
          </form>
        ) : null}
        <div className={styles.actions}>
          <button className="button-primary" onClick={() => void handleShare()} type="button">
            {copied ? t("dota.team.copied") : t("dota.team.inviteCta")}
          </button>
          {authSession && party.isMember ? (
            <button
              className="button-secondary"
              disabled={pending}
              onClick={() => void handleLeave()}
              type="button"
            >
              {t("dota.team.leave")}
            </button>
          ) : null}
        </div>
      </header>

      {party.openSlots > 0 ? (
        <p className={styles.searchSoon}>{t("dota.team.searchSoon")}</p>
      ) : null}

      <div className={styles.slots}>
        {party.members.map((member) => (
          <article className={styles.slot} key={member.userId}>
            <span className={styles.slotRole}>
              {member.role === "OWNER" ? t("dota.team.roleOwner") : t("dota.team.roleMember")}
            </span>
            <strong>
              {member.dotaSlug ? (
                <Link href={`/dota/${member.dotaSlug}`}>{member.displayName}</Link>
              ) : (
                member.displayName
              )}
            </strong>
            <span className={styles.slotMeta}>{member.mmr ? `MMR ${member.mmr}` : "—"}</span>
          </article>
        ))}
        {emptySlots.map((_, index) => (
          <article className={`${styles.slot} ${styles.slotEmpty}`} key={`empty-${index}`}>
            <span className={styles.slotRole}>{t("dota.team.openSlot")}</span>
            <strong>{t("dota.team.inviteFriend")}</strong>
            <span className={styles.slotMeta}>{t("dota.team.openSlotHint")}</span>
          </article>
        ))}
      </div>

      {party.isOwner && party.openSlots > 0 ? (
        <section className={styles.invitePanel}>
          <h2>{t("dota.team.inviteFriendsTitle")}</h2>
          {inviteCandidates.length === 0 ? (
            <div className={styles.inviteEmpty}>
              <p>{t("dota.team.noFriendsToInvite")}</p>
              <Link className="button-secondary" href="/dota#dota-account-id-search">
                {t("dota.team.addFriendCta")}
              </Link>
            </div>
          ) : (
            <ul className={styles.friendList}>
              {inviteCandidates.map((friend) => (
                <li key={friend.id}>
                  <span>{friend.displayName}</span>
                  <button
                    className="button-secondary"
                    disabled={pending}
                    onClick={() => void handleInvite(friend.id)}
                    type="button"
                  >
                    {t("dota.team.invite")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {party.isMember ? (
        <section className={styles.chatPanel}>
          <h2>{t("dota.team.chatTitle")}</h2>
          <p className={styles.chatHint}>{t("dota.team.chatHint")}</p>
          <div className={styles.chatMessages}>
            {chatMessages.length === 0 ? (
              <p className={styles.chatEmpty}>{t("dota.team.chatEmpty")}</p>
            ) : (
              chatMessages.map((message) => (
                <article className={styles.chatMessage} key={message.id}>
                  <strong>{message.displayName}</strong>
                  <span>{message.message}</span>
                </article>
              ))
            )}
          </div>
          <form className={styles.chatForm} onSubmit={handleSendChat}>
            <input
              maxLength={2000}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder={t("dota.team.chatPlaceholder")}
              value={chatDraft}
            />
            <button
              className="button-primary"
              disabled={chatPending || chatDraft.trim().length === 0}
              type="submit"
            >
              {chatPending ? t("common.loadingEllipsis") : t("dota.team.chatSend")}
            </button>
          </form>
          {chatError ? <FormFeedback errorMessage={chatError} /> : null}
        </section>
      ) : null}

      {error ? <FormFeedback errorMessage={error} /> : null}

      <p className={styles.canonicalHint}>
        {t(
          party.kind === "PARTY" ? "dota.team.pageUrlHintParty" : "dota.team.pageUrlHintTeam",
          { url: buildDotaTeamUrl(party.slug) }
        )}
      </p>
    </section>
  );
}

interface DotaCreateTeamFormProps {
  onCreated?: (party: GameParty) => void;
}

export function DotaCreateTeamForm({ onCreated }: DotaCreateTeamFormProps) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [kind, setKind] = useState<GamePartyKind>("TEAM");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authSession?.accessToken) {
      setError(t("dota.team.signInRequired"));
      return;
    }

    setPending(true);
    setError(null);

    try {
      const party = await createGameParty(kind, authSession.accessToken);
      onCreated?.(party);
      router.push(`/dota/teams/${party.slug}`);
    } catch {
      setError(t("dota.team.createError"));
      setPending(false);
    }
  }

  return (
    <form className={styles.createForm} onSubmit={handleSubmit}>
      <h2>{t("dota.team.createTitle")}</h2>
      <p>
        {kind === "PARTY"
          ? t("dota.team.createPartyLead", {
              hours: String(DOTA_TEMP_PARTY_TTL_HOURS),
              max: String(DOTA_PARTY_SIZE)
            })
          : t("dota.team.createLead", { max: String(DOTA_PARTY_SIZE) })}
      </p>
      <p className={styles.createNameHint}>{t("dota.team.createNameHint")}</p>
      <fieldset className={styles.kindFieldset}>
        <legend>{t("dota.team.kindLabel")}</legend>
        <label className={styles.kindOption}>
          <input
            checked={kind === "TEAM"}
            name="party-kind"
            onChange={() => setKind("TEAM")}
            type="radio"
            value="TEAM"
          />
          <span>
            <strong>{t("dota.team.kindTeam")}</strong>
            <em>{t("dota.team.kindTeamHint")}</em>
          </span>
        </label>
        <label className={styles.kindOption}>
          <input
            checked={kind === "PARTY"}
            name="party-kind"
            onChange={() => setKind("PARTY")}
            type="radio"
            value="PARTY"
          />
          <span>
            <strong>{t("dota.team.kindParty")}</strong>
            <em>{t("dota.team.kindPartyHint", { hours: String(DOTA_TEMP_PARTY_TTL_HOURS) })}</em>
          </span>
        </label>
      </fieldset>
      <button className="button-primary" disabled={pending} type="submit">
        {pending
          ? t("common.loadingEllipsis")
          : kind === "PARTY"
            ? t("dota.team.createPartyCta")
            : t("dota.team.createCta")}
      </button>
      {error ? <FormFeedback errorMessage={error} /> : null}
    </form>
  );
}
