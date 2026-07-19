"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TranslateFn } from "@reviewo/i18n";

import { DOTA_PARTY_SIZE, DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS, DOTA_TEMP_PARTY_EXTEND_HOURS, DOTA_TEMP_PARTY_TTL_HOURS, type DotaGreenFlagKey, type DotaRedFlagKey } from "@reviewo/shared";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorCode, readApiErrorMessage } from "../../../lib/api/read-api-error";
import { isChatListNearBottom } from "../../entity-chat/lib/chat-ui-helpers";
import {
  resolveInviteDecisionError,
  resolveStackInviteError
} from "../../games/lib/resolve-stack-invite-error";
import { useNotificationToasts } from "../../games/lib/use-notification-toasts";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getDiscordLinkUrl } from "../../profile/api/profile";
import { openDiscordPartyVoice } from "../../social/lib/discord-invite";
import {
  fetchDotaLfg,
  fetchMyDotaProfile,
  setDotaLfgLooking,
  type DotaLfgHit
} from "../api/dota-api";
import {
  acceptPartyInvite,
  createGameParty,
  createPartyJoinToken,
  declinePartyInvite,
  disbandGameParty,
  ensurePartyDiscordVoice,
  extendGameParty,
  extendPartyDiscordVoice,
  fetchFriendRequests,
  fetchFriends,
  fetchGameParty,
  fetchMyParties,
  fetchPartyChatMessages,
  joinPartyByToken,
  kickGamePartyMember,
  leaveGameParty,
  renameGameParty,
  sendFriendRequest,
  sendPartyChatMessage,
  stackWithPlayer,
  updatePartyJoinMode,
  updatePartyMemberPosition,
  updatePartyMemberRole
} from "../../social/api/social-api";
import {
  connectPartySocket,
  connectPartyWatchSocket,
  type PartyRecruitUpdated,
  type PartySocketConnection,
  type PartySocketHandlersRef,
  type PartyWatchSocketConnection
} from "../../social/lib/party-socket";
import {
  PARTY_NOTIFICATION_EVENT,
  type PartyNotificationEventDetail
} from "../../social/lib/party-notifications-socket";
import type {
  DotaPositionRole,
  FriendUser,
  GameParty,
  GamePartyChatMessage,
  GamePartyInvite,
  GamePartyKind
} from "../../social/types/social";
import {
  getDotaGreenFlagLabel,
  getDotaPositionLabel,
  getDotaRedFlagLabel
} from "../lib/labels";
import { buildDotaTeamUrl, copyDotaTeamJoinUrl } from "../lib/share";
import styles from "./dota-team-view.module.css";

const PENDING_PARTY_JOIN_KEY = "opinia.pendingPartyJoin";
const PENDING_DISCORD_VOICE_JOIN_KEY = "opinia.pendingDiscordVoiceJoin";
const PENDING_DISCORD_VOICE_JOIN_LOCK_PREFIX = "opinia.discordVoiceJoinLock:";
const ROLE_POSITIONS = ["1", "2", "3", "4", "5"] as const satisfies readonly DotaPositionRole[];
/** Soft resync only on tab focus / socket reconnect — not a timer poll. */
const TEAM_SOFT_SYNC_MIN_GAP_MS = 12_000;
const RECRUIT_CANDIDATE_REFRESH_MS = 10_000;
const RECRUIT_CANDIDATE_PAGE_SIZE = 3;

function filterPartyApplications(
  invites: GamePartyInvite[],
  partySlug: string
): GamePartyInvite[] {
  return invites.filter(
    (invite) =>
      invite.status === "PENDING" &&
      invite.inviteKind === "APPLICATION" &&
      invite.partySlug === partySlug
  );
}

/** Join-link applications have no positionRole — show them on the first open slot. */
function applicationMatchesSlotRole(
  invite: GamePartyInvite,
  role: DotaPositionRole,
  unscopedFallbackRole: DotaPositionRole | null
): boolean {
  if (invite.positionRole === role) {
    return true;
  }

  return !invite.positionRole && role === unscopedFallbackRole;
}

function firstOpenPositionRole(
  members: Array<{ positionRole?: DotaPositionRole | null }>
): DotaPositionRole | null {
  const claimed = new Set(
    members
      .map((member) => member.positionRole)
      .filter((role): role is DotaPositionRole => Boolean(role))
  );

  return ROLE_POSITIONS.find((role) => !claimed.has(role)) ?? ROLE_POSITIONS[0] ?? null;
}

function findPendingInviteForParty(
  invites: GamePartyInvite[],
  partySlug: string
): GamePartyInvite | null {
  return (
    invites.find(
      (invite) =>
        invite.status === "PENDING" &&
        invite.partySlug === partySlug &&
        invite.inviteKind !== "APPLICATION"
    ) ?? null
  );
}

function rolesFromRecruitPayload(payload: PartyRecruitUpdated): DotaPositionRole[] {
  if (!payload.looking) {
    return [];
  }

  return payload.recruitedRoles.filter((role): role is DotaPositionRole =>
    ROLE_POSITIONS.includes(role as DotaPositionRole)
  );
}

function matchingRecruitRoles(
  candidate: DotaLfgHit,
  openRoles: readonly DotaPositionRole[]
): DotaPositionRole[] {
  return openRoles.filter((role) => candidate.roles.includes(role));
}

function lookLikeJoinToken(value: string | null): value is string {
  if (!value) {
    return false;
  }

  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

interface DotaTeamViewProps {
  party: GameParty;
}

function formatRemainingExpiry(
  expiresAt: string | null,
  t: ReturnType<typeof useTranslation>
): { label: string; msLeft: number; urgent: boolean } | null {
  if (!expiresAt) {
    return null;
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const msLeft = date.getTime() - Date.now();

  if (msLeft <= 0) {
    return {
      label: t("dota.team.expiresIn", { remaining: t("dota.team.expiresInM", { minutes: "0" }) }),
      msLeft: 0,
      urgent: true
    };
  }

  const totalMinutes = Math.max(1, Math.ceil(msLeft / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remaining =
    hours > 0
      ? t("dota.team.expiresInHm", { hours: String(hours), minutes: String(minutes) })
      : t("dota.team.expiresInM", { minutes: String(totalMinutes) });

  return {
    label: t("dota.team.expiresIn", { remaining }),
    msLeft,
    urgent: msLeft <= 30 * 60_000
  };
}

function formatRemainingVoiceExpiry(
  expiresAt: string | null | undefined,
  t: ReturnType<typeof useTranslation>
): { label: string; msLeft: number; urgent: boolean } | null {
  if (!expiresAt) {
    return null;
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const msLeft = date.getTime() - Date.now();

  if (msLeft <= 0) {
    return {
      label: t("dota.team.discordVoiceExpiresIn", {
        remaining: t("dota.team.expiresInM", { minutes: "0" })
      }),
      msLeft: 0,
      urgent: true
    };
  }

  const totalMinutes = Math.max(1, Math.ceil(msLeft / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remaining =
    hours > 0
      ? t("dota.team.expiresInHm", { hours: String(hours), minutes: String(minutes) })
      : t("dota.team.expiresInM", { minutes: String(totalMinutes) });

  return {
    label: t("dota.team.discordVoiceExpiresIn", { remaining }),
    msLeft,
    urgent: msLeft <= 60 * 60_000
  };
}

function resolveChatDisplayText(
  message: string,
  t: ReturnType<typeof useTranslation>
): { isSystem: boolean; text: string } {
  if (message === "__system__:discord_voice_ready") {
    return { isSystem: true, text: t("dota.team.system.discord_voice_ready") };
  }

  return { isSystem: false, text: message };
}

function mergeChatMessages(
  current: GamePartyChatMessage[],
  incoming: GamePartyChatMessage[]
): GamePartyChatMessage[] {
  const byId = new Map<string, GamePartyChatMessage>();

  for (const message of current) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function applyLivePartyUpdate(
  current: GameParty,
  incoming: GameParty,
  viewerUserId: string | undefined
): GameParty {
  if (!viewerUserId) {
    return {
      ...incoming,
      canManageParty: Boolean(current.canManageParty),
      // Guests never keep Discord invites (view-room socket strips them).
      discordInviteUrl: null,
      isMember: current.isMember,
      isOfficer: Boolean(current.isOfficer),
      isOwner: current.isOwner
    };
  }

  const isOwner = incoming.ownerUserId === viewerUserId;
  const isOfficer = incoming.members.some(
    (member) => member.userId === viewerUserId && member.role === "OFFICER"
  );
  const isMember = incoming.members.some((member) => member.userId === viewerUserId);

  return {
    ...incoming,
    canManageParty: isOwner || isOfficer,
    // Members also receive party_view updates with invite stripped — keep last known
    // while voice is still active (expiresAt present). Clear once voice is gone.
    discordInviteUrl:
      incoming.discordInviteUrl ??
      (isMember && incoming.discordVoiceExpiresAt ? current.discordInviteUrl ?? null : null),
    isMember,
    isOfficer,
    isOwner
  };
}

function memberRoleLabel(
  role: GameParty["members"][number]["role"],
  t: TranslateFn
): string {
  if (role === "OWNER") {
    return t("dota.team.roleOwner");
  }

  if (role === "OFFICER") {
    return t("dota.team.roleOfficer");
  }

  return t("dota.team.roleMember");
}

function partyMemberInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }

  return trimmed.slice(0, 1).toUpperCase();
}

export function DotaTeamView({ party: initialParty }: DotaTeamViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const { push: pushToast } = useNotificationToasts();
  const [party, setParty] = useState(initialParty);
  const canManageParty = Boolean(
    party.isOwner || party.isOfficer || party.canManageParty
  );
  const [expiryInfo, setExpiryInfo] = useState(() =>
    formatRemainingExpiry(initialParty.expiresAt, t)
  );
  const [voiceExpiryInfo, setVoiceExpiryInfo] = useState(() =>
    formatRemainingVoiceExpiry(initialParty.discordVoiceExpiresAt, t)
  );
  const [renameEditing, setRenameEditing] = useState(false);
  const [extendHintDismissed, setExtendHintDismissed] = useState(false);
  const [extendVoiceBusy, setExtendVoiceBusy] = useState(false);
  const expiryWarnSentRef = useRef(false);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [discordVoiceBusy, setDiscordVoiceBusy] = useState(false);
  const [discordVoiceCopied, setDiscordVoiceCopied] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [friendBusyId, setFriendBusyId] = useState<string | null>(null);
  const [outgoingFriendIds, setOutgoingFriendIds] = useState<Set<string>>(() => new Set());
  const knownDiscordInviteRef = useRef(initialParty.discordInviteUrl ?? null);
  const [chatMessages, setChatMessages] = useState<GamePartyChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [applications, setApplications] = useState<GamePartyInvite[]>([]);
  const [applicationBusyId, setApplicationBusyId] = useState<string | null>(null);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [appsPanelRole, setAppsPanelRole] = useState<DotaPositionRole | null>(null);
  const appsPanelRootRef = useRef<HTMLDivElement | null>(null);
  const [isRecruitLooking, setIsRecruitLooking] = useState(false);
  const [recruitRoles, setRecruitRoles] = useState<DotaPositionRole[]>([]);
  const [lookingBusy, setLookingBusy] = useState(false);
  const [lookingError, setLookingError] = useState<string | null>(null);
  const [recruitCandidates, setRecruitCandidates] = useState<DotaLfgHit[]>([]);
  const [recruitCandidateBatch, setRecruitCandidateBatch] = useState(0);
  const [recruitCandidatesLoading, setRecruitCandidatesLoading] = useState(false);
  const [recruitCandidateBusyKey, setRecruitCandidateBusyKey] = useState<string | null>(null);
  const [recruitCandidateError, setRecruitCandidateError] = useState<string | null>(null);
  const [recruitCandidateMessage, setRecruitCandidateMessage] = useState<string | null>(null);
  const invitedRecruitCandidateSlugsRef = useRef(new Set<string>());
  const [hasDotaProfile, setHasDotaProfile] = useState<boolean | null>(null);
  const [visitorOpenRoles, setVisitorOpenRoles] = useState<DotaPositionRole[]>([]);
  const [visitorApplyBusyRole, setVisitorApplyBusyRole] = useState<DotaPositionRole | null>(null);
  const [visitorApplyError, setVisitorApplyError] = useState<string | null>(null);
  const [viewerInvite, setViewerInvite] = useState<GamePartyInvite | null>(null);
  const [viewerInviteBusy, setViewerInviteBusy] = useState(false);
  const [viewerInviteError, setViewerInviteError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState(initialParty.name);
  const [renaming, setRenaming] = useState(false);
  const [joinModeBusy, setJoinModeBusy] = useState(false);
  const [joinModeError, setJoinModeError] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [copiedDotaIdUserId, setCopiedDotaIdUserId] = useState<string | null>(null);
  const joinHandledRef = useRef(false);
  const partySocketRef = useRef<PartySocketConnection | null>(null);
  const canManagePartyRef = useRef(canManageParty);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const shouldStickChatToBottomRef = useRef(true);
  const pendingChatScrollToBottomRef = useRef(false);
  const joinTokenFromUrl = lookLikeJoinToken(searchParams.get("join"))
    ? searchParams.get("join")
    : null;

  canManagePartyRef.current = canManageParty;

  useEffect(() => {
    if (!isAuthSessionLoaded || !authSession?.accessToken) {
      return;
    }

    if (!party.isMember) {
      return;
    }

    const discordStatus = searchParams.get("discord");
    const pendingSlug =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(PENDING_DISCORD_VOICE_JOIN_KEY)
        : null;
    const fromPending = pendingSlug === party.slug;

    if (discordStatus === "error") {
      window.sessionStorage.removeItem(PENDING_DISCORD_VOICE_JOIN_KEY);
      window.sessionStorage.removeItem(`${PENDING_DISCORD_VOICE_JOIN_LOCK_PREFIX}${party.slug}`);
      setError(t("dota.team.discordLinkError"));
      const next = new URLSearchParams(searchParams.toString());
      next.delete("discord");
      next.delete("discordReason");
      const query = next.toString();
      router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname, {
        scroll: false
      });
      return;
    }

    // Only auto-join after successful OAuth. Never re-trigger OAuth from pending alone.
    if (discordStatus !== "linked") {
      if (fromPending) {
        window.sessionStorage.removeItem(PENDING_DISCORD_VOICE_JOIN_KEY);
      }
      return;
    }

    const lockKey = `${PENDING_DISCORD_VOICE_JOIN_LOCK_PREFIX}${party.slug}`;
    if (window.sessionStorage.getItem(lockKey) === "1") {
      return;
    }

    window.sessionStorage.setItem(lockKey, "1");
    window.sessionStorage.removeItem(PENDING_DISCORD_VOICE_JOIN_KEY);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("discord");
    next.delete("discordReason");
    const query = next.toString();
    router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname, {
      scroll: false
    });

    void handleDiscordVoice("open", { allowOauthRedirect: false }).finally(() => {
      window.setTimeout(() => {
        window.sessionStorage.removeItem(lockKey);
      }, 8000);
    });
    // Intentionally once after OAuth return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authSession?.accessToken,
    isAuthSessionLoaded,
    party.isMember,
    party.kind,
    party.slug,
    searchParams
  ]);

  const scrollChatToBottom = useCallback((): boolean => {
    const list = chatMessagesRef.current;

    if (!list) {
      return false;
    }

    list.scrollTop = list.scrollHeight - list.clientHeight;
    return true;
  }, []);

  const requestChatScrollToBottom = useCallback((): void => {
    pendingChatScrollToBottomRef.current = true;
    shouldStickChatToBottomRef.current = true;
  }, []);

  useEffect(() => {
    setParty(initialParty);
    setRenameDraft(initialParty.name);
    // Only re-seed from SSR when navigating to another team — not on every prop identity change.
  }, [initialParty.slug]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional slug-only sync

  useEffect(() => {
    if (!appsPanelRole) {
      return;
    }

    const unscopedFallbackRole = firstOpenPositionRole(party.members);
    const stillHasApps = applications.some(
      (invite) =>
        invite.status === "PENDING" &&
        applicationMatchesSlotRole(invite, appsPanelRole, unscopedFallbackRole)
    );

    if (!stillHasApps) {
      setAppsPanelRole(null);
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!appsPanelRootRef.current?.contains(event.target as Node)) {
        setAppsPanelRole(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAppsPanelRole(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [applications, appsPanelRole, party.members]);

  useEffect(() => {
    if (!isAuthSessionLoaded || joinHandledRef.current) {
      return;
    }

    const pendingRaw =
      typeof window !== "undefined" ? window.sessionStorage.getItem(PENDING_PARTY_JOIN_KEY) : null;
    let pendingJoin: { slug: string; token: string } | null = null;

    if (pendingRaw) {
      try {
        pendingJoin = JSON.parse(pendingRaw) as { slug: string; token: string };
      } catch {
        pendingJoin = null;
      }
    }

    const token = joinTokenFromUrl ?? (pendingJoin?.slug === party.slug ? pendingJoin.token : null);

    if (!token) {
      return;
    }

    if (!authSession?.accessToken) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          PENDING_PARTY_JOIN_KEY,
          JSON.stringify({ slug: party.slug, token })
        );
      }
      setError(t("dota.team.joinNeedAuth"));
      return;
    }

    joinHandledRef.current = true;
    setPending(true);
    setError(null);

    void joinPartyByToken(token, authSession.accessToken)
      .then((updated) => {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(PENDING_PARTY_JOIN_KEY);
        }
        setParty(updated);
        setJoinMessage(
          updated.isMember ? t("dota.team.joinSuccess") : t("games.search.applicationSent")
        );
        router.replace(`/dota/teams/${updated.slug}`);
      })
      .catch(() => {
        joinHandledRef.current = false;
        setError(t("dota.team.joinError"));
      })
      .finally(() => {
        setPending(false);
      });
  }, [
    authSession?.accessToken,
    isAuthSessionLoaded,
    joinTokenFromUrl,
    party.slug,
    router,
    t
  ]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    let cancelled = false;

    void fetchGameParty(initialParty.slug, authSession.accessToken)
      .then((refreshed) => {
        if (!cancelled) {
          setParty((current) => applyLivePartyUpdate(current, refreshed, authSession.userId));
          setRenameDraft(refreshed.name);
        }
      })
      .catch(() => {
        // Keep SSR payload if refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, authSession?.userId, initialParty.slug]);

  useEffect(() => {
    if (!authSession?.accessToken || !party.isMember) {
      setFriends([]);
      setOutgoingFriendIds(new Set());
      return;
    }

    let cancelled = false;

    void Promise.all([
      fetchFriends(authSession.accessToken),
      fetchFriendRequests(authSession.accessToken)
    ])
      .then(([friendsResponse, requestsResponse]) => {
        if (cancelled) {
          return;
        }

        setFriends(friendsResponse.friends);
        setOutgoingFriendIds(
          new Set(requestsResponse.outgoing.map((request) => request.otherUser.id))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFriends([]);
          setOutgoingFriendIds(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, party.isMember]);

  useEffect(() => {
    if (!authSession?.accessToken || !party.isMember) {
      setChatMessages([]);
      if (!canManageParty) {
        setApplications([]);
      }
      return;
    }

    let cancelled = false;
    shouldStickChatToBottomRef.current = true;
    pendingChatScrollToBottomRef.current = true;
    const accessToken = authSession.accessToken;
    const viewerUserId = authSession.userId;

    function refreshApplications(): void {
      if (!canManagePartyRef.current || !accessToken) {
        return;
      }

      void fetchMyParties(accessToken)
        .then((myParties) => {
          if (cancelled) {
            return;
          }
          setApplications(filterPartyApplications(myParties.outgoingInvites ?? [], party.slug));
        })
        .catch(() => {
          // Ignore transient failures.
        });
    }

    const needsResyncRef = { current: false };
    const lastSoftSyncAtRef = { current: 0 };

    const softSync = async (options?: { force?: boolean }) => {
      if (!authSession.accessToken || cancelled) {
        return;
      }

      const now = Date.now();

      if (
        !options?.force &&
        now - lastSoftSyncAtRef.current < TEAM_SOFT_SYNC_MIN_GAP_MS
      ) {
        return;
      }

      lastSoftSyncAtRef.current = now;

      try {
        const [nextParty, lfg, myParties] = await Promise.all([
          fetchGameParty(party.slug, authSession.accessToken),
          fetchDotaLfg(),
          canManagePartyRef.current
            ? fetchMyParties(authSession.accessToken)
            : Promise.resolve(null)
        ]);

        if (cancelled) {
          return;
        }

        setParty((current) => applyLivePartyUpdate(current, nextParty, authSession.userId));

        if (myParties) {
          setApplications(
            filterPartyApplications(myParties.outgoingInvites ?? [], party.slug)
          );
        }

        const hit = lfg.results.find((player) => player.partySlug === party.slug);

        if (hit) {
          setIsRecruitLooking(true);
          setRecruitRoles(
            hit.recruitedRoles.filter((role): role is DotaPositionRole =>
              ROLE_POSITIONS.includes(role as DotaPositionRole)
            )
          );
        } else {
          setIsRecruitLooking(false);
          setRecruitRoles([]);
        }
      } catch {
        // Keep previous live state on transient failures.
      }
    };

    const handlersRef: PartySocketHandlersRef = {
      current: {
        onDisconnect: () => {
          needsResyncRef.current = true;
        },
        onMessages: (messages) => {
          if (!cancelled) {
            pendingChatScrollToBottomRef.current = true;
            shouldStickChatToBottomRef.current = true;
            setChatMessages(messages);
          }
        },
        onNewMessage: (message) => {
          if (!cancelled) {
            const list = chatMessagesRef.current;

            if (list) {
              shouldStickChatToBottomRef.current = isChatListNearBottom(list);
            }

            if (shouldStickChatToBottomRef.current) {
              pendingChatScrollToBottomRef.current = true;
            }

            setChatMessages((current) => mergeChatMessages(current, [message]));
          }
        },
        onPartyUpdated: (nextParty) => {
          if (!cancelled) {
            const previousInvite = knownDiscordInviteRef.current;
            const nextInvite = nextParty.discordInviteUrl ?? null;

            if (nextInvite && nextInvite !== previousInvite) {
              pushToast({
                body: t("dota.team.discordVoiceReadyBody"),
                ctaLabel: t("dota.team.discordVoiceJoin"),
                href: nextInvite,
                id: `discord-voice-ready-${nextParty.id}`,
                title: t("dota.team.discordVoiceReadyToast")
              });
            }

            setParty((current) => {
              const merged = applyLivePartyUpdate(current, nextParty, viewerUserId);
              knownDiscordInviteRef.current = merged.discordInviteUrl ?? null;
              return merged;
            });

            if (canManagePartyRef.current) {
              refreshApplications();
            }

            // After reconnect, join ack brings roster — force-pull recruit/apps once.
            if (needsResyncRef.current) {
              needsResyncRef.current = false;
              void softSync({ force: true });
            }
          }
        },
        onRecruitUpdated: (payload) => {
          if (cancelled) {
            return;
          }

          const roles = rolesFromRecruitPayload(payload);
          setIsRecruitLooking(roles.length > 0);
          setRecruitRoles(roles);

          if (canManagePartyRef.current) {
            refreshApplications();
          }
        }
      }
    };

    let socketConnection: PartySocketConnection | null = connectPartySocket(
      party.slug,
      accessToken,
      handlersRef
    );
    partySocketRef.current = socketConnection;

    const refreshLiveState = async () => {
      if (!authSession.accessToken || cancelled) {
        return;
      }

      try {
        const [nextParty, chatPage, myParties, lfg] = await Promise.all([
          fetchGameParty(party.slug, authSession.accessToken),
          fetchPartyChatMessages(party.slug, authSession.accessToken),
          canManagePartyRef.current
            ? fetchMyParties(authSession.accessToken)
            : Promise.resolve(null),
          fetchDotaLfg()
        ]);

        if (cancelled) {
          return;
        }

        setParty((current) =>
          applyLivePartyUpdate(current, nextParty, authSession.userId)
        );

        if (myParties) {
          setApplications(
            filterPartyApplications(myParties.outgoingInvites ?? [], party.slug)
          );
        }

        if (lfg) {
          const hit = lfg.results.find((player) => player.partySlug === party.slug);

          if (hit) {
            setIsRecruitLooking(true);
            const openRoles = hit.recruitedRoles.filter((role): role is DotaPositionRole =>
              ROLE_POSITIONS.includes(role as DotaPositionRole)
            );
            setRecruitRoles(openRoles);
          } else {
            setIsRecruitLooking(false);
            setRecruitRoles([]);
          }
        }

        const list = chatMessagesRef.current;
        const stick =
          shouldStickChatToBottomRef.current ||
          (list ? isChatListNearBottom(list) : true);

        if (stick) {
          pendingChatScrollToBottomRef.current = true;
          shouldStickChatToBottomRef.current = true;
        }

        setChatMessages((current) => mergeChatMessages(current, chatPage.messages));
      } catch {
        // Keep previous live state on transient failures.
      }
    };

    void refreshLiveState();

    function handleVisibility(): void {
      if (document.visibilityState === "visible") {
        void softSync();
      }
    }

    function handlePartyNotification(event: Event): void {
      if (cancelled || !canManagePartyRef.current) {
        return;
      }

      const detail = (event as CustomEvent<PartyNotificationEventDetail>).detail;

      if (!detail?.type || detail.invite?.partySlug !== party.slug) {
        return;
      }

      // Apply payload immediately — don't wait for fetchMyParties (slow on Docker).
      if (detail.type === "application_received" && detail.invite.status === "PENDING") {
        setApplications((current) => {
          if (current.some((item) => item.id === detail.invite.id)) {
            return current;
          }

          return [
            {
              ...detail.invite,
              direction: "outgoing",
              inviteKind: detail.invite.inviteKind ?? "APPLICATION"
            },
            ...current
          ];
        });
      }

      if (detail.type === "declined") {
        setApplications((current) => current.filter((item) => item.id !== detail.invite.id));
      }

      if (detail.type === "accepted" || detail.type === "member_joined") {
        const closedRole = detail.invite.positionRole;
        setApplications((current) =>
          current.filter((item) => {
            if (item.id === detail.invite.id) {
              return false;
            }

            if (closedRole && item.positionRole === closedRole) {
              return false;
            }

            return true;
          })
        );
      }

      if (
        detail.type === "application_received" ||
        detail.type === "accepted" ||
        detail.type === "declined" ||
        detail.type === "member_joined"
      ) {
        refreshApplications();
      }
    }

    window.addEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (partySocketRef.current === socketConnection) {
        partySocketRef.current = null;
      }
      socketConnection?.disconnect();
      socketConnection = null;
    };
  }, [authSession?.accessToken, authSession?.userId, party.isMember, party.slug, pushToast, t]);

  useEffect(() => {
    if (!canManageParty) {
      setApplications([]);
      setApplicationError(null);
      return;
    }

    if (!authSession?.accessToken) {
      return;
    }

    let cancelled = false;
    void fetchMyParties(authSession.accessToken)
      .then((myParties) => {
        if (!cancelled) {
          setApplications(
            filterPartyApplications(myParties.outgoingInvites ?? [], party.slug)
          );
        }
      })
      .catch(() => {
        // Socket updates and focus resync remain available after transient failures.
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, canManageParty, party.slug]);

  // Always watch party_view for roster — members used to skip this and only relied on chat join.
  useEffect(() => {
    let cancelled = false;
    let watchConnection: PartyWatchSocketConnection | null = null;
    const viewerUserId = authSession?.userId;
    const isMember = party.isMember;

    watchConnection = connectPartyWatchSocket(party.slug, authSession?.accessToken ?? null, {
      onPartyUpdated: (nextParty) => {
        if (cancelled) {
          return;
        }

        setParty((current) => applyLivePartyUpdate(current, nextParty, viewerUserId));
      },
      onRecruitUpdated: (payload) => {
        if (cancelled) {
          return;
        }

        const roles = rolesFromRecruitPayload(payload);

        if (isMember) {
          setIsRecruitLooking(roles.length > 0);
          setRecruitRoles(roles);
        } else {
          setVisitorOpenRoles(roles);
        }
      }
    });

    return () => {
      cancelled = true;
      watchConnection?.disconnect();
      watchConnection = null;
    };
  }, [authSession?.accessToken, authSession?.userId, party.isMember, party.slug]);

  useEffect(() => {
    if (party.isMember) {
      setVisitorOpenRoles([]);
      setVisitorApplyError(null);
      setViewerInvite(null);
      setViewerInviteError(null);
      return;
    }

    if (!authSession?.accessToken) {
      setViewerInvite(null);
      setViewerInviteError(null);
    }

    let cancelled = false;
    const lastSoftSyncAtRef = { current: 0 };

    async function loadVisitorRecruitRoles() {
      try {
        const lfg = await fetchDotaLfg();
        if (cancelled) {
          return;
        }

        const hit = lfg.results.find((player) => player.partySlug === party.slug);
        const roles = (hit?.recruitedRoles ?? []).filter((role): role is DotaPositionRole =>
          ROLE_POSITIONS.includes(role as DotaPositionRole)
        );
        setVisitorOpenRoles(roles);
      } catch {
        if (!cancelled) {
          setVisitorOpenRoles([]);
        }
      }
    }

    async function loadViewerInvite() {
      if (!authSession?.accessToken) {
        return;
      }

      try {
        const myParties = await fetchMyParties(authSession.accessToken);
        if (!cancelled) {
          setViewerInvite(findPendingInviteForParty(myParties.invites, party.slug));
        }
      } catch {
        if (!cancelled) {
          setViewerInvite(null);
        }
      }
    }

    async function softSyncVisitor() {
      if (cancelled) {
        return;
      }

      const now = Date.now();

      if (now - lastSoftSyncAtRef.current < TEAM_SOFT_SYNC_MIN_GAP_MS) {
        return;
      }

      lastSoftSyncAtRef.current = now;

      void loadVisitorRecruitRoles();
      void loadViewerInvite();
      void fetchGameParty(party.slug, authSession?.accessToken)
        .then((nextParty) => {
          if (!cancelled) {
            setParty((current) => applyLivePartyUpdate(current, nextParty, authSession?.userId));
          }
        })
        .catch(() => {
          // Ignore transient failures.
        });
    }

    void loadVisitorRecruitRoles();
    void loadViewerInvite();

    function handleVisibility(): void {
      if (document.visibilityState === "visible") {
        void softSyncVisitor();
      }
    }

    function handlePartyNotification(event: Event) {
      const detail = (event as CustomEvent<PartyNotificationEventDetail>).detail;

      if (detail?.invite?.partySlug !== party.slug) {
        return;
      }

      if (
        detail.type === "invite_received" ||
        detail.type === "declined" ||
        detail.type === "accepted" ||
        detail.type === "member_joined"
      ) {
        void loadViewerInvite();
      }
    }

    window.addEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authSession?.accessToken, authSession?.userId, party.isMember, party.slug]);

  useEffect(() => {
    if (!authSession?.accessToken || !canManageParty) {
      return;
    }

    let cancelled = false;

    void fetchMyDotaProfile(authSession.accessToken)
      .then(() => {
        if (!cancelled) {
          setHasDotaProfile(true);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setHasDotaProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, canManageParty]);

  useLayoutEffect(() => {
    if (!party.isMember || chatMessages.length === 0) {
      return;
    }

    if (!pendingChatScrollToBottomRef.current && !shouldStickChatToBottomRef.current) {
      return;
    }

    pendingChatScrollToBottomRef.current = false;
    scrollChatToBottom();
    const frame = window.requestAnimationFrame(() => {
      scrollChatToBottom();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [chatMessages, party.isMember, scrollChatToBottom]);

  const friendIds = new Set(friends.map((friend) => friend.id));
  const claimedRoles = new Set(
    party.members
      .map((member) => member.positionRole)
      .filter((role): role is DotaPositionRole => Boolean(role))
  );
  const selectableRecruitRoles = ROLE_POSITIONS.filter((role) => !claimedRoles.has(role));
  const effectiveRecruitRoles = recruitRoles.filter((role) => selectableRecruitRoles.includes(role));
  // Join-link applications often have no positionRole — surface them on the first open slot.
  const unscopedAppsFallbackRole = firstOpenPositionRole(party.members);
  const positionSlots = ROLE_POSITIONS.map((role) => ({
    apps: applications.filter((invite) =>
      applicationMatchesSlotRole(invite, role, unscopedAppsFallbackRole)
    ),
    member: party.members.find((item) => item.positionRole === role) ?? null,
    recruiting: isRecruitLooking && effectiveRecruitRoles.includes(role),
    role
  }));
  const unassignedMembers = party.members.filter((member) => !member.positionRole);
  const myMembership = authSession?.userId
    ? party.members.find((member) => member.userId === authSession.userId) ?? null
    : null;
  const recruitRoleKey = effectiveRecruitRoles.join(",");
  const partyMemberUserKey = party.members.map((member) => member.userId).sort().join(",");

  const refreshRecruitCandidates = useCallback(
    async (options?: { advance?: boolean; quiet?: boolean }) => {
      if (!canManageParty || !isRecruitLooking || !recruitRoleKey) {
        setRecruitCandidates([]);
        setRecruitCandidateBatch(0);
        return;
      }

      if (!options?.quiet) {
        setRecruitCandidatesLoading(true);
      }
      setRecruitCandidateError(null);

      try {
        const openRoles = recruitRoleKey
          .split(",")
          .filter((role): role is DotaPositionRole =>
            ROLE_POSITIONS.includes(role as DotaPositionRole)
          );
        const memberUserIds = new Set(partyMemberUserKey.split(",").filter(Boolean));
        const response = await fetchDotaLfg({ roles: openRoles });
        const candidates = response.results.filter(
          (candidate) =>
            !candidate.partySlug &&
            candidate.ownerUserId !== party.ownerUserId &&
            !memberUserIds.has(candidate.ownerUserId) &&
            !invitedRecruitCandidateSlugsRef.current.has(candidate.slug) &&
            matchingRecruitRoles(candidate, openRoles).length > 0
        );

        setRecruitCandidates(candidates);
        setRecruitCandidateBatch((current) => {
          const batchCount = Math.max(
            1,
            Math.ceil(candidates.length / RECRUIT_CANDIDATE_PAGE_SIZE)
          );
          return options?.advance ? (current + 1) % batchCount : current % batchCount;
        });
      } catch {
        setRecruitCandidateError(t("dota.team.candidatesLoadError"));
      } finally {
        if (!options?.quiet) {
          setRecruitCandidatesLoading(false);
        }
      }
    },
    [
      canManageParty,
      isRecruitLooking,
      party.ownerUserId,
      partyMemberUserKey,
      recruitRoleKey,
      t
    ]
  );

  useEffect(() => {
    if (!canManageParty || !isRecruitLooking || !recruitRoleKey) {
      setRecruitCandidates([]);
      setRecruitCandidateBatch(0);
      return;
    }

    void refreshRecruitCandidates();
    const intervalId = window.setInterval(() => {
      void refreshRecruitCandidates({ quiet: true });
    }, RECRUIT_CANDIDATE_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canManageParty, isRecruitLooking, recruitRoleKey, refreshRecruitCandidates]);

  const recruitCandidateBatchCount = Math.max(
    1,
    Math.ceil(recruitCandidates.length / RECRUIT_CANDIDATE_PAGE_SIZE)
  );
  const visibleRecruitCandidates = recruitCandidates.slice(
    (recruitCandidateBatch % recruitCandidateBatchCount) * RECRUIT_CANDIDATE_PAGE_SIZE,
    (recruitCandidateBatch % recruitCandidateBatchCount) * RECRUIT_CANDIDATE_PAGE_SIZE +
      RECRUIT_CANDIDATE_PAGE_SIZE
  );
  const pendingApplications = applications.filter((invite) => invite.status === "PENDING");

  useEffect(() => {
    function refreshExpiry() {
      const next = formatRemainingExpiry(party.expiresAt, t);
      setExpiryInfo(next);
      setVoiceExpiryInfo(formatRemainingVoiceExpiry(party.discordVoiceExpiresAt, t));

      // Local voice TTL hit — drop dead invite until Join recreates / cleanup broadcasts.
      if (
        party.discordVoiceExpiresAt &&
        new Date(party.discordVoiceExpiresAt).getTime() <= Date.now() &&
        (party.discordInviteUrl || party.canExtendDiscordVoice)
      ) {
        knownDiscordInviteRef.current = null;
        setParty((current) => {
          if (!current.discordInviteUrl && !current.canExtendDiscordVoice) {
            return current;
          }

          return {
            ...current,
            canExtendDiscordVoice: false,
            discordInviteUrl: null
          };
        });
      }

      if (
        next &&
        next.msLeft > 0 &&
        next.msLeft <= 15 * 60_000 &&
        !expiryWarnSentRef.current &&
        party.isMember
      ) {
        expiryWarnSentRef.current = true;
        pushToast({
          body: t("dota.team.expiryWarnBody"),
          id: `party-expiry-warn-${party.id}`,
          title: t("dota.team.expiryWarnToast")
        });
      }
    }

    refreshExpiry();
    const intervalId = window.setInterval(refreshExpiry, 30_000);
    return () => window.clearInterval(intervalId);
  }, [
    party.canExtendDiscordVoice,
    party.discordInviteUrl,
    party.discordVoiceExpiresAt,
    party.expiresAt,
    party.id,
    party.isMember,
    pushToast,
    t
  ]);

  useEffect(() => {
    expiryWarnSentRef.current = false;
  }, [party.expiresAt]);

  useEffect(() => {
    try {
      setExtendHintDismissed(
        window.sessionStorage.getItem(`party-extend-hint:${party.slug}`) === "1"
      );
    } catch {
      setExtendHintDismissed(false);
    }
  }, [party.slug]);

  const kindLabel =
    party.kind === "PARTY" ? t("dota.team.kindParty") : t("dota.team.kindTeam");

  async function handleShare() {
    setError(null);

    if (!authSession?.accessToken || !party.isMember) {
      const ok = await copyTextToClipboard(buildDotaTeamUrl(party.slug));
      setCopied(ok);

      if (ok) {
        window.setTimeout(() => setCopied(false), 1800);
      }

      return;
    }

    try {
      const { token } = await createPartyJoinToken(party.slug, authSession.accessToken);
      const ok = await copyDotaTeamJoinUrl(party.slug, token);
      setCopied(ok);

      if (ok) {
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      setError(t("dota.team.inviteError"));
    }
  }

  async function handleDiscordVoice(
    mode: "open" | "copy" = "open",
    options: { allowOauthRedirect?: boolean } = {}
  ) {
    if (!authSession?.accessToken || !party.isMember || discordVoiceBusy) {
      return;
    }

    const allowOauthRedirect = options.allowOauthRedirect !== false;

    setDiscordVoiceBusy(true);
    setError(null);

    try {
      const intent = mode === "copy" ? "share" : "join";
      const hadShareUrl = Boolean(party.discordInviteUrl ?? knownDiscordInviteRef.current);
      const voice = await ensurePartyDiscordVoice(party.slug, authSession.accessToken, intent);

      if (intent === "share") {
        knownDiscordInviteRef.current = voice.inviteUrl;
        setParty((current) => ({
          ...current,
          canExtendDiscordVoice:
            current.kind === "TEAM"
              ? Boolean(current.canManageParty)
              : Boolean(current.canExtendDiscordVoice),
          discordInviteUrl: voice.inviteUrl,
          discordVoiceAvailable: true,
          discordVoiceExpiresAt: voice.expiresAt ?? current.discordVoiceExpiresAt ?? null
        }));

        const ok = await copyTextToClipboard(voice.inviteUrl);
        setDiscordVoiceCopied(ok);

        if (ok) {
          window.setTimeout(() => setDiscordVoiceCopied(false), 1800);
        }

        return;
      }

      setParty((current) => ({
        ...current,
        canExtendDiscordVoice:
          current.kind === "TEAM"
            ? Boolean(current.canManageParty)
            : Boolean(current.canExtendDiscordVoice),
        discordInviteUrl: current.discordInviteUrl ?? voice.inviteUrl,
        discordVoiceAvailable: true,
        discordVoiceExpiresAt: voice.expiresAt ?? current.discordVoiceExpiresAt ?? null
      }));

      if (!hadShareUrl) {
        const share = await ensurePartyDiscordVoice(party.slug, authSession.accessToken, "share");
        knownDiscordInviteRef.current = share.inviteUrl;
        setParty((current) => ({
          ...current,
          discordInviteUrl: share.inviteUrl,
          discordVoiceAvailable: true,
          discordVoiceExpiresAt: share.expiresAt ?? current.discordVoiceExpiresAt ?? null
        }));
        pushToast({
          body: t("dota.team.discordVoiceReadyBody"),
          ctaLabel: t("dota.team.discordVoiceJoin"),
          href: share.inviteUrl,
          id: `discord-voice-ready-${party.id}`,
          title: t("dota.team.discordVoiceReadyToast")
        });
      }

      openDiscordPartyVoice(voice);
    } catch (voiceError) {
      const isDiscordNotLinked =
        voiceError instanceof ApiError &&
        voiceError.status === 403 &&
        (readApiErrorCode(voiceError.body) === "DISCORD_NOT_LINKED" ||
          /link your discord/i.test(voiceError.message) ||
          /link your discord/i.test(String(readApiErrorMessage(voiceError.body) ?? "")));

      if (isDiscordNotLinked && allowOauthRedirect) {
        await redirectToDiscordLink();
        return;
      }

      if (isDiscordNotLinked) {
        window.sessionStorage.removeItem(PENDING_DISCORD_VOICE_JOIN_KEY);
        setError(t("dota.team.discordLinkError"));
        return;
      }

      setError(t("dota.team.discordVoiceError"));
    } finally {
      setDiscordVoiceBusy(false);
    }
  }

  async function redirectToDiscordLink() {
    if (!authSession?.accessToken) {
      return;
    }

    try {
      window.sessionStorage.setItem(PENDING_DISCORD_VOICE_JOIN_KEY, party.slug);
      window.sessionStorage.removeItem(`${PENDING_DISCORD_VOICE_JOIN_LOCK_PREFIX}${party.slug}`);

      // Keep returnTo short — bulky query tokens break OAuth state.
      const returnTo = window.location.pathname || "/";
      const { url } = await getDiscordLinkUrl(
        authSession.accessToken,
        returnTo,
        window.location.origin
      );
      window.location.assign(url);
    } catch (linkError) {
      window.sessionStorage.removeItem(PENDING_DISCORD_VOICE_JOIN_KEY);
      if (linkError instanceof ApiError && linkError.status === 503) {
        setError(t("dota.team.discordLinkNotConfigured"));
      } else {
        setError(t("dota.team.discordLinkError"));
      }
    }
  }

  async function handleExtendParty() {
    if (!authSession?.accessToken || !party.canExtendParty || extendBusy) {
      return;
    }

    setExtendBusy(true);
    setError(null);

    try {
      const updated = await extendGameParty(party.slug, authSession.accessToken);
      if (updated.discordInviteUrl) {
        knownDiscordInviteRef.current = updated.discordInviteUrl;
      }
      setParty(updated);
    } catch (extendError) {
      if (extendError instanceof ApiError && extendError.status === 400) {
        setError(t("dota.team.extendMaxReached"));
      } else {
        setError(t("dota.team.extendError"));
      }
    } finally {
      setExtendBusy(false);
    }
  }

  async function handleExtendDiscordVoice() {
    if (!authSession?.accessToken || !party.canExtendDiscordVoice || extendVoiceBusy) {
      return;
    }

    setExtendVoiceBusy(true);
    setError(null);

    try {
      const updated = await extendPartyDiscordVoice(party.slug, authSession.accessToken);
      if (updated.discordInviteUrl) {
        knownDiscordInviteRef.current = updated.discordInviteUrl;
      }
      setParty(updated);
    } catch (extendError) {
      if (extendError instanceof ApiError && extendError.status === 400) {
        setError(t("dota.team.discordVoiceExtendMaxReached"));
      } else {
        setError(t("dota.team.discordVoiceExtendError"));
      }
    } finally {
      setExtendVoiceBusy(false);
    }
  }

  async function handleAddPartyFriend(userId: string) {
    if (!authSession?.accessToken || userId === authSession.userId || friendBusyId) {
      return;
    }

    setFriendBusyId(userId);
    setError(null);

    try {
      await sendFriendRequest(userId, authSession.accessToken);
      setOutgoingFriendIds((current) => new Set(current).add(userId));
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setFriendBusyId(null);
    }
  }

  async function handleLeave() {
    if (!authSession?.accessToken || pending) {
      return;
    }

    const mustDisband = party.isOwner && party.members.length > 1;
    const confirmed = window.confirm(
      mustDisband
        ? t("games.community.disbandConfirm", { name: party.name })
        : t("games.community.leaveConfirm", { name: party.name })
    );

    if (!confirmed) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      if (mustDisband) {
        await disbandGameParty(party.slug, authSession.accessToken);
      } else {
        await leaveGameParty(party.slug, authSession.accessToken);
      }

      router.push("/games/community");
    } catch {
      setError(mustDisband ? t("games.community.disbandError") : t("dota.team.leaveError"));
      setPending(false);
    }
  }

  async function handleKick(userId: string) {
    if (!authSession?.accessToken || !canManageParty || pending) {
      return;
    }

    const target = party.members.find((member) => member.userId === userId);

    if (!target || target.role === "OWNER") {
      return;
    }

    if (target.role === "OFFICER" && !party.isOwner) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const updated = await kickGamePartyMember(party.slug, userId, authSession.accessToken);
      setParty(updated);
    } catch {
      setError(t("dota.team.kickError"));
    } finally {
      setPending(false);
    }
  }

  async function handleToggleOfficer(userId: string, makeOfficer: boolean) {
    if (!authSession?.accessToken || !party.isOwner || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const updated = await updatePartyMemberRole(
        party.slug,
        userId,
        makeOfficer ? "OFFICER" : "MEMBER",
        authSession.accessToken
      );
      setParty(updated);
    } catch {
      setError(t("dota.team.officerError"));
    } finally {
      setPending(false);
    }
  }

  async function syncRecruitLooking(nextRoles: DotaPositionRole[]) {
    if (!authSession?.accessToken || !canManageParty || lookingBusy) {
      return;
    }

    const roles = nextRoles.filter((role) => !claimedRoles.has(role));
    setRecruitRoles(roles);
    setLookingBusy(true);
    setLookingError(null);

    try {
      if (roles.length === 0) {
        if (isRecruitLooking) {
          await setDotaLfgLooking(false, authSession.accessToken, {
            partySlug: party.slug
          });
        }
        setIsRecruitLooking(false);
        return;
      }

      if (hasDotaProfile === false && party.isOwner) {
        setLookingError(t("dota.team.recruitNeedProfile"));
        return;
      }

      await setDotaLfgLooking(true, authSession.accessToken, {
        partySlug: party.slug,
        recruitedRoles: roles
      });
      setIsRecruitLooking(true);
      if (party.isOwner) {
        setHasDotaProfile(true);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setHasDotaProfile(false);
        setLookingError(t("dota.team.recruitNeedProfile"));
      } else {
        setLookingError(resolveStackInviteError(error, t));
      }
    } finally {
      setLookingBusy(false);
    }
  }

  async function handleToggleRecruitRole(role: DotaPositionRole) {
    if (!canManageParty || claimedRoles.has(role) || lookingBusy) {
      return;
    }

    const isRecruitingRole = isRecruitLooking && effectiveRecruitRoles.includes(role);
    const next = isRecruitingRole
      ? effectiveRecruitRoles.filter((item) => item !== role)
      : [...new Set([...effectiveRecruitRoles, role])].sort();

    await syncRecruitLooking(next);
  }

  async function handleInviteRecruitCandidate(
    candidate: DotaLfgHit,
    role: DotaPositionRole
  ) {
    if (
      !authSession?.accessToken ||
      !canManageParty ||
      !effectiveRecruitRoles.includes(role) ||
      recruitCandidateBusyKey
    ) {
      return;
    }

    const busyKey = `${candidate.slug}:${role}`;
    setRecruitCandidateBusyKey(busyKey);
    setRecruitCandidateError(null);
    setRecruitCandidateMessage(null);

    try {
      const result = await stackWithPlayer(
        candidate.slug,
        authSession.accessToken,
        party.slug,
        role
      );
      setParty((current) => applyLivePartyUpdate(current, result.party, authSession.userId));
      invitedRecruitCandidateSlugsRef.current.add(candidate.slug);
      setRecruitCandidates((current) =>
        current.filter((item) => item.slug !== candidate.slug)
      );
      setRecruitCandidateMessage(
        t("dota.team.candidateInvited", { name: candidate.title, role })
      );
    } catch (inviteError) {
      setRecruitCandidateError(resolveStackInviteError(inviteError, t));
      void refreshRecruitCandidates({ quiet: true });
    } finally {
      setRecruitCandidateBusyKey(null);
    }
  }

  async function handleAcceptApplication(invite: GamePartyInvite) {
    if (!authSession?.accessToken || !canManageParty || applicationBusyId) {
      return;
    }

    setApplicationBusyId(invite.id);
    setApplicationError(null);

    try {
      const updated = await acceptPartyInvite(invite.id, authSession.accessToken);
      setParty(updated);

      const acceptedRole = invite.positionRole;
      setApplications((current) =>
        current.filter((item) => {
          if (item.id === invite.id) {
            return false;
          }

          if (acceptedRole && item.positionRole === acceptedRole) {
            return false;
          }

          return true;
        })
      );

      const rolesAfterAccept = acceptedRole
        ? effectiveRecruitRoles.filter((role) => role !== acceptedRole && !updated.members.some((m) => m.positionRole === role))
        : effectiveRecruitRoles.filter((role) => !updated.members.some((m) => m.positionRole === role));

      if (updated.openSlots <= 0) {
        setRecruitRoles([]);
        setIsRecruitLooking(false);
      } else if (acceptedRole) {
        setRecruitRoles(rolesAfterAccept);
        if (rolesAfterAccept.length === 0) {
          setIsRecruitLooking(false);
        }
      }

      void fetchMyParties(authSession.accessToken)
        .then((myParties) => {
          setApplications(filterPartyApplications(myParties.outgoingInvites ?? [], party.slug));
        })
        .catch(() => {
          // Keep optimistic applications list.
        });
    } catch (acceptError) {
      setApplicationError(resolveInviteDecisionError(acceptError, t));

      try {
        const myParties = await fetchMyParties(authSession.accessToken);
        setApplications(filterPartyApplications(myParties.outgoingInvites ?? [], party.slug));
      } catch {
        // Keep local list if refresh fails.
      }
    } finally {
      setApplicationBusyId(null);
    }
  }

  async function handleCopyMemberDotaId(userId: string, dotaAccountId: string) {
    const ok = await copyTextToClipboard(dotaAccountId);

    if (!ok) {
      return;
    }

    setCopiedDotaIdUserId(userId);
    window.setTimeout(() => {
      setCopiedDotaIdUserId((current) => (current === userId ? null : current));
    }, 1600);
  }

  async function handleDeclineApplication(invite: GamePartyInvite) {
    if (!authSession?.accessToken || !canManageParty || applicationBusyId) {
      return;
    }

    setApplicationBusyId(invite.id);
    setApplicationError(null);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setApplications((current) => current.filter((item) => item.id !== invite.id));
    } catch (declineError) {
      setApplicationError(resolveInviteDecisionError(declineError, t));
    } finally {
      setApplicationBusyId(null);
    }
  }

  async function handleVisitorApply(role: DotaPositionRole) {
    if (!authSession?.accessToken || party.isMember || visitorApplyBusyRole) {
      return;
    }

    const captain =
      party.members.find((member) => member.userId === party.ownerUserId) ??
      party.members.find((member) => member.role === "OWNER") ??
      null;
    const captainSlug = captain?.dotaSlug;

    if (!captainSlug) {
      setVisitorApplyError(t("games.search.error.playerNotFound"));
      return;
    }

    setVisitorApplyBusyRole(role);
    setVisitorApplyError(null);

    try {
      const result = await stackWithPlayer(captainSlug, authSession.accessToken, undefined, role);
      if (result.party.isMember || result.invite.status === "ACCEPTED") {
        setParty((current) => applyLivePartyUpdate(current, result.party, authSession.userId));
        setVisitorOpenRoles([]);
        setJoinMessage(t("dota.team.joinSuccess"));
      } else {
        setVisitorOpenRoles((current) => current.filter((item) => item !== role));
        setJoinMessage(t("games.search.applicationSent"));
      }
    } catch (applyError) {
      setVisitorApplyError(resolveStackInviteError(applyError, t));
    } finally {
      setVisitorApplyBusyRole(null);
    }
  }

  async function handleAcceptViewerInvite() {
    if (!authSession?.accessToken || !viewerInvite || viewerInviteBusy) {
      return;
    }

    setViewerInviteBusy(true);
    setViewerInviteError(null);

    try {
      const joined = await acceptPartyInvite(viewerInvite.id, authSession.accessToken);
      setParty(joined);
      setViewerInvite(null);
      setJoinMessage(t("dota.team.joinSuccess"));
    } catch (acceptError) {
      setViewerInviteError(resolveInviteDecisionError(acceptError, t));
    } finally {
      setViewerInviteBusy(false);
    }
  }

  async function handleDeclineViewerInvite() {
    if (!authSession?.accessToken || !viewerInvite || viewerInviteBusy) {
      return;
    }

    setViewerInviteBusy(true);
    setViewerInviteError(null);

    try {
      await declinePartyInvite(viewerInvite.id, authSession.accessToken);
      setViewerInvite(null);
    } catch (declineError) {
      setViewerInviteError(resolveInviteDecisionError(declineError, t));
    } finally {
      setViewerInviteBusy(false);
    }
  }

  async function handleClaimSlot(role: DotaPositionRole) {
    if (!authSession?.accessToken || !party.isMember || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const updated = await updatePartyMemberPosition(party.slug, role, authSession.accessToken);
      setParty((current) => applyLivePartyUpdate(current, updated, authSession.userId));
    } catch {
      setError(t("dota.team.claimError"));
    } finally {
      setPending(false);
    }
  }

  async function handleClearSlot() {
    if (!authSession?.accessToken || !party.isMember || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const updated = await updatePartyMemberPosition(party.slug, null, authSession.accessToken);
      setParty((current) => applyLivePartyUpdate(current, updated, authSession.userId));
    } catch {
      setError(t("dota.team.claimError"));
    } finally {
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
      setRenameEditing(false);
    } catch {
      setError(t("dota.team.renameError"));
    } finally {
      setRenaming(false);
    }
  }

  async function handleJoinModeChange(nextMode: "OPEN" | "CONFIRM") {
    if (!authSession?.accessToken || !canManageParty || joinModeBusy) {
      return;
    }

    if ((party.joinMode ?? "CONFIRM") === nextMode) {
      return;
    }

    setJoinModeBusy(true);
    setJoinModeError(null);

    try {
      const updated = await updatePartyJoinMode(party.slug, nextMode, authSession.accessToken);
      setParty((current) => applyLivePartyUpdate(current, updated, authSession.userId));
    } catch {
      setJoinModeError(t("dota.team.joinModeError"));
    } finally {
      setJoinModeBusy(false);
    }
  }

  async function handleSendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authSession?.accessToken || chatDraft.trim().length === 0) {
      return;
    }

    const text = chatDraft.trim();
    setChatPending(true);
    setChatError(null);

    try {
      let created: GamePartyChatMessage | null = null;

      if (partySocketRef.current?.isReady()) {
        try {
          created = await partySocketRef.current.sendMessage(text);
        } catch {
          created = null;
        }
      }

      if (!created) {
        created = await sendPartyChatMessage(party.slug, text, authSession.accessToken);
      }

      requestChatScrollToBottom();
      setChatMessages((current) => mergeChatMessages(current, [created!]));
      setChatDraft("");
    } catch {
      setChatError(t("dota.team.chatSendError"));
    } finally {
      setChatPending(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.workspace}>
        <div
          className={styles.rosterColumn}
        >
          <header className={styles.header}>
            <div className={styles.headerTop}>
              <div className={styles.headerCopy}>
                <p className={styles.eyebrow}>{kindLabel}</p>
                {canManageParty && renameEditing ? (
                  <form className={styles.renameForm} onSubmit={handleRename}>
                    <label className="field-label">
                      {t("dota.team.renameLabel")}
                      <input
                        autoFocus
                        maxLength={80}
                        minLength={2}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        value={renameDraft}
                      />
                    </label>
                    <div className={styles.renameActions}>
                      <button
                        className="button-primary"
                        disabled={
                          renaming ||
                          renameDraft.trim().length < 2 ||
                          renameDraft.trim() === party.name
                        }
                        type="submit"
                      >
                        {renaming ? t("common.loadingEllipsis") : t("dota.team.renameSave")}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={renaming}
                        onClick={() => {
                          setRenameDraft(party.name);
                          setRenameEditing(false);
                        }}
                        type="button"
                      >
                        {t("dota.team.renameCancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.titleRow}>
                    <h1>{party.name}</h1>
                    {canManageParty ? (
                      <button
                        className={styles.iconButton}
                        onClick={() => {
                          setRenameDraft(party.name);
                          setRenameEditing(true);
                        }}
                        title={t("dota.team.renameEdit")}
                        type="button"
                      >
                        ✎
                      </button>
                    ) : null}
                  </div>
                )}
                <p className={styles.lead}>
                  {t("dota.team.lead", {
                    current: String(party.memberCount),
                    max: String(party.maxMembers)
                  })}
                </p>
              </div>

              {unassignedMembers.length > 0 ? (
                <section className={styles.unassignedPanel}>
                  <div className={styles.unassignedHead}>
                    <p className={styles.unassignedEyebrow}>{t("dota.team.unassigned")}</p>
                    <span className={styles.unassignedCount}>{unassignedMembers.length}</span>
                  </div>
                  <ul className={styles.unassignedList}>
                    {unassignedMembers.map((member) => (
                      <li className={styles.unassignedRow} key={`unassigned-${member.userId}`}>
                        <div className={styles.unassignedIdentity}>
                          <div aria-hidden="true" className={styles.unassignedAvatar}>
                            {member.role === "OWNER" ? (
                              <span className={styles.unassignedCrown}>♛</span>
                            ) : null}
                            {partyMemberInitial(member.displayName)}
                          </div>
                          <div className={styles.unassignedCopy}>
                            {member.dotaSlug ? (
                              <Link href={`/dota/${member.dotaSlug}`}>{member.displayName}</Link>
                            ) : (
                              <strong>{member.displayName}</strong>
                            )}
                            <span className={styles.unassignedMeta}>
                              {memberRoleLabel(member.role, t)}
                              {member.mmr ? ` · ${member.mmr} MMR` : ""}
                            </span>
                          </div>
                        </div>
                        <div className={styles.unassignedActions}>
                          {canManageParty &&
                          member.role !== "OWNER" &&
                          (party.isOwner || member.role === "MEMBER") ? (
                            <button
                              className={styles.unassignedKick}
                              disabled={pending}
                              onClick={() => void handleKick(member.userId)}
                              type="button"
                            >
                              {t("dota.team.kick")}
                            </button>
                          ) : null}
                          {party.isOwner && member.role === "MEMBER" ? (
                            <button
                              className={styles.unassignedAction}
                              disabled={pending}
                              onClick={() => void handleToggleOfficer(member.userId, true)}
                              type="button"
                            >
                              {t("dota.team.makeOfficer")}
                            </button>
                          ) : null}
                          {party.isOwner && member.role === "OFFICER" ? (
                            <button
                              className={styles.unassignedAction}
                              disabled={pending}
                              onClick={() => void handleToggleOfficer(member.userId, false)}
                              type="button"
                            >
                              {t("dota.team.removeOfficer")}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            {canManageParty && party.openSlots > 0 ? (
              <div className={styles.joinModeBlock}>
                <p className={styles.joinModeLabel}>{t("dota.team.joinModeLabel")}</p>
                <div
                  aria-label={t("dota.team.joinModeLabel")}
                  className={styles.joinModeCards}
                  role="group"
                >
                  <button
                    aria-pressed={(party.joinMode ?? "CONFIRM") === "OPEN"}
                    className={`${styles.joinModeCard}${
                      (party.joinMode ?? "CONFIRM") === "OPEN"
                        ? ` ${styles.joinModeCardOpen}`
                        : ""
                    }`}
                    disabled={joinModeBusy}
                    onClick={() => void handleJoinModeChange("OPEN")}
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.joinModeIconOpen}>
                      <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
                        <path
                          d="M13 2 4 14h7l-1 8 10-14h-7l0-6Z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                    <span className={styles.joinModeCopy}>
                      <strong>{t("dota.team.joinModeOpen")}</strong>
                      <em>{t("dota.team.joinModeOpenHint")}</em>
                    </span>
                  </button>
                  <button
                    aria-pressed={(party.joinMode ?? "CONFIRM") === "CONFIRM"}
                    className={`${styles.joinModeCard}${
                      (party.joinMode ?? "CONFIRM") === "CONFIRM"
                        ? ` ${styles.joinModeCardConfirm}`
                        : ""
                    }`}
                    disabled={joinModeBusy}
                    onClick={() => void handleJoinModeChange("CONFIRM")}
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.joinModeIconConfirm}>
                      <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
                        <path
                          d="M12 3 5 6v5c0 4.5 2.9 8.5 7 10 4.1-1.5 7-5.5 7-10V6l-7-3Z"
                          fill="currentColor"
                          opacity="0.95"
                        />
                      </svg>
                    </span>
                    <span className={styles.joinModeCopy}>
                      <strong>{t("dota.team.joinModeConfirm")}</strong>
                      <em>{t("dota.team.joinModeConfirmHint")}</em>
                    </span>
                  </button>
                </div>
                {joinModeError ? <p className={styles.joinModeError}>{joinModeError}</p> : null}
              </div>
            ) : null}
            {expiryInfo ? (
              <div className={styles.expiryRow}>
                <p className={`${styles.lead}${expiryInfo.urgent ? ` ${styles.expiryUrgent}` : ""}`}>
                  {expiryInfo.label}
                </p>
                {party.canExtendParty ? (
                  <button
                    className={`${styles.extendButton}${
                      expiryInfo.urgent ||
                      (Boolean(party.discordInviteUrl) && expiryInfo.msLeft <= 60 * 60_000)
                        ? ` ${styles.extendButtonUrgent}`
                        : ""
                    }`}
                    disabled={extendBusy}
                    onClick={() => void handleExtendParty()}
                    type="button"
                  >
                    {extendBusy
                      ? t("dota.team.extendBusy")
                      : t("dota.team.extendCta", {
                          hours: String(DOTA_TEMP_PARTY_EXTEND_HOURS)
                        })}
                  </button>
                ) : null}
              </div>
            ) : null}
            {party.canExtendParty &&
            party.discordInviteUrl &&
            expiryInfo &&
            expiryInfo.msLeft <= 60 * 60_000 &&
            !extendHintDismissed ? (
              <p className={styles.extendHint}>
                <span>{t("dota.team.extendWhileVoiceHint")}</span>
                <button
                  className={styles.hintDismiss}
                  onClick={() => {
                    setExtendHintDismissed(true);
                    try {
                      window.sessionStorage.setItem(`party-extend-hint:${party.slug}`, "1");
                    } catch {
                      // ignore
                    }
                  }}
                  type="button"
                >
                  ×
                </button>
              </p>
            ) : null}
            {joinMessage ? <p className={styles.lead}>{joinMessage}</p> : null}
            {canManageParty && pendingApplications.length > 0 ? (
              <p className={styles.appsHint}>
                {t("dota.team.appsOnSlotsHint", { count: String(pendingApplications.length) })}
              </p>
            ) : null}
            <div className={styles.actions}>
              {viewerInvite && !party.isMember ? (
                <>
                  <button
                    className={styles.actionPrimary}
                    disabled={viewerInviteBusy}
                    onClick={() => void handleAcceptViewerInvite()}
                    type="button"
                  >
                    {viewerInviteBusy ? t("common.loadingEllipsis") : t("dota.team.acceptInvite")}
                  </button>
                  <button
                    className={styles.actionSecondary}
                    disabled={viewerInviteBusy}
                    onClick={() => void handleDeclineViewerInvite()}
                    type="button"
                  >
                    {t("dota.team.declineInvite")}
                  </button>
                </>
              ) : (
                <button
                  className={styles.actionPrimary}
                  onClick={() => void handleShare()}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.actionIcon}>
                    🔗
                  </span>
                  {copied ? t("dota.team.copied") : t("dota.team.inviteCta")}
                </button>
              )}
              {authSession && party.isMember && party.discordVoiceAvailable ? (
                <>
                  <button
                    className={styles.actionSecondary}
                    disabled={discordVoiceBusy}
                    onClick={() => void handleDiscordVoice("open")}
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.actionIcon}>
                      🔊
                    </span>
                    {discordVoiceBusy
                      ? t("common.loadingEllipsis")
                      : party.discordInviteUrl
                        ? t("dota.team.discordVoiceJoin")
                        : t("dota.team.discordVoiceCreate")}
                  </button>
                  {party.discordInviteUrl ? (
                    <button
                      className={styles.actionSecondary}
                      disabled={discordVoiceBusy}
                      onClick={() => void handleDiscordVoice("copy")}
                      type="button"
                    >
                      {discordVoiceCopied
                        ? t("dota.team.discordVoiceCopied")
                        : t("dota.team.discordVoiceCopy")}
                    </button>
                  ) : null}
                </>
              ) : null}
              {authSession && party.isMember ? (
                <button
                  className={styles.actionLeave}
                  disabled={pending}
                  onClick={() => void handleLeave()}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.actionIcon}>
                    ⎋
                  </span>
                  {party.isOwner && party.members.length > 1
                    ? t("games.community.disbandRoster")
                    : t("dota.team.leave")}
                </button>
              ) : null}
              {!authSession && joinTokenFromUrl ? (
                <Link className={styles.actionSecondary} href="/dota/create">
                  {t("games.search.createCta")}
                </Link>
              ) : null}
            </div>
            {authSession && party.isMember && party.discordVoiceAvailable ? (
              <p className={styles.discordVoiceHint}>
                {party.kind === "TEAM"
                  ? t("dota.team.discordVoiceHintTeam")
                  : t("dota.team.discordVoiceHint")}
              </p>
            ) : null}
            {party.kind === "TEAM" && voiceExpiryInfo && party.discordInviteUrl ? (
              <div className={styles.expiryRow}>
                <p
                  className={`${styles.lead}${voiceExpiryInfo.urgent ? ` ${styles.expiryUrgent}` : ""}`}
                >
                  {voiceExpiryInfo.label}
                </p>
                {party.canExtendDiscordVoice ? (
                  <button
                    className={`${styles.extendButton}${
                      voiceExpiryInfo.urgent ? ` ${styles.extendButtonUrgent}` : ""
                    }`}
                    disabled={extendVoiceBusy}
                    onClick={() => void handleExtendDiscordVoice()}
                    type="button"
                  >
                    {extendVoiceBusy
                      ? t("common.loadingEllipsis")
                      : t("dota.team.discordVoiceExtendCta", {
                          hours: String(DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS)
                        })}
                  </button>
                ) : null}
              </div>
            ) : null}
            {viewerInvite && !party.isMember ? (
              <p className={styles.viewerInviteHint}>
                {viewerInvite.positionRole
                  ? t("dota.team.youWereInvitedRole", {
                      role: `${viewerInvite.positionRole} ${getDotaPositionLabel(viewerInvite.positionRole, t)}`
                    })
                  : t("dota.team.youWereInvited")}
              </p>
            ) : null}
            {viewerInviteError ? <FormFeedback errorMessage={viewerInviteError} /> : null}
          </header>

          {(lookingError || applicationError) && canManageParty ? (
            <div className={styles.rosterFeedback}>
              <FormFeedback errorMessage={lookingError ?? applicationError} />
            </div>
          ) : null}

          <div className={styles.slots}>
            {positionSlots.map(({ apps, member, recruiting, role }) => (
          <article
            className={`${styles.slot}${member ? "" : ` ${styles.slotEmpty}`}${
              recruiting ? ` ${styles.slotRecruiting}` : ""
            }`}
            key={`pos-${role}`}
          >
            <span className={styles.slotRole}>
              <span className={styles.slotRoleNum}>{role}</span>
              {getDotaPositionLabel(role, t)}
            </span>
            {member ? (
              <>
                <div className={styles.slotAvatarWrap}>
                  {member.role === "OWNER" ? (
                    <span aria-hidden="true" className={styles.slotCrown}>
                      ♛
                    </span>
                  ) : null}
                  <div className={styles.slotAvatar} aria-hidden="true">
                    {partyMemberInitial(member.displayName)}
                  </div>
                </div>
                <strong>
                  {member.dotaSlug ? (
                    <Link href={`/dota/${member.dotaSlug}`}>{member.displayName}</Link>
                  ) : (
                    member.displayName
                  )}
                </strong>
                <span className={styles.slotMeta}>
                  {memberRoleLabel(member.role, t)}
                  {member.mmr ? (
                    <>
                      {" · "}
                      <span className={styles.slotMmr}>{member.mmr} MMR</span>
                    </>
                  ) : null}
                </span>
                {member.dotaAccountId ? (
                  <button
                    className={styles.dotaIdButton}
                    onClick={() => void handleCopyMemberDotaId(member.userId, member.dotaAccountId!)}
                    title={t("dota.profile.dotaIdCopyHint")}
                    type="button"
                  >
                    {copiedDotaIdUserId === member.userId
                      ? t("dota.team.memberDotaIdCopied")
                      : t("dota.team.memberDotaId", { id: member.dotaAccountId })}
                  </button>
                ) : null}
                <div className={styles.slotActions}>
                  {myMembership?.userId === member.userId ? (
                    <button
                      className={styles.slotSecondaryBtn}
                      disabled={pending}
                      onClick={() => void handleClearSlot()}
                      type="button"
                    >
                      {t("dota.team.clearSlot")}
                    </button>
                  ) : null}
                  {party.isMember &&
                  authSession &&
                  member.userId !== authSession.userId &&
                  !friendIds.has(member.userId) ? (
                    outgoingFriendIds.has(member.userId) ? (
                      <span className={styles.friendStatus}>{t("dota.team.friendPending")}</span>
                    ) : (
                      <button
                        className={styles.friendButton}
                        disabled={friendBusyId === member.userId}
                        onClick={() => void handleAddPartyFriend(member.userId)}
                        title={t("dota.team.addFriend")}
                        type="button"
                      >
                        {friendBusyId === member.userId
                          ? t("common.loadingEllipsis")
                          : t("dota.team.addFriend")}
                      </button>
                    )
                  ) : null}
                  {canManageParty &&
                  member.role !== "OWNER" &&
                  (party.isOwner || member.role === "MEMBER") ? (
                    <button
                      className={styles.kickButton}
                      disabled={pending}
                      onClick={() => void handleKick(member.userId)}
                      type="button"
                    >
                      {t("dota.team.kick")}
                    </button>
                  ) : null}
                  {party.isOwner && member.role === "MEMBER" ? (
                    <button
                      className={styles.kickButton}
                      disabled={pending}
                      onClick={() => void handleToggleOfficer(member.userId, true)}
                      type="button"
                    >
                      {t("dota.team.makeOfficer")}
                    </button>
                  ) : null}
                  {party.isOwner && member.role === "OFFICER" ? (
                    <button
                      className={styles.kickButton}
                      disabled={pending}
                      onClick={() => void handleToggleOfficer(member.userId, false)}
                      type="button"
                    >
                      {t("dota.team.removeOfficer")}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {canManageParty ? (
                  <>
                    <div className={styles.slotAvatarEmpty} aria-hidden="true">
                      +
                    </div>
                    <strong>
                      {recruiting ? t("dota.team.slotFreeLooking") : t("dota.team.openSlot")}
                    </strong>
                    <div className={styles.slotActions}>
                      {party.isMember ? (
                        <button
                          className={styles.slotPrimaryBtn}
                          disabled={pending || lookingBusy}
                          onClick={() => void handleClaimSlot(role)}
                          type="button"
                        >
                          {t("dota.team.claimSlot")}
                        </button>
                      ) : null}
                      <button
                        className={styles.slotSecondaryBtn}
                        disabled={lookingBusy || (party.isOwner && hasDotaProfile === false)}
                        onClick={() => void handleToggleRecruitRole(role)}
                        type="button"
                      >
                        {lookingBusy
                          ? t("common.loadingEllipsis")
                          : recruiting
                            ? t("dota.team.slotStopFind")
                            : t("dota.team.slotFind")}
                      </button>
                    </div>
                    {party.isOwner && hasDotaProfile === false ? (
                      <Link className={styles.slotProfileLink} href="/dota/create">
                        {t("dota.team.recruitNeedProfileCta")}
                      </Link>
                    ) : null}
                    {apps.length > 0 ? (
                      <div
                        className={styles.slotAppsRoot}
                        ref={appsPanelRole === role ? appsPanelRootRef : undefined}
                      >
                        <button
                          aria-expanded={appsPanelRole === role}
                          aria-haspopup="dialog"
                          className={styles.slotAppsTrigger}
                          onClick={() =>
                            setAppsPanelRole((current) => (current === role ? null : role))
                          }
                          type="button"
                        >
                          {t("dota.team.slotAppsCta", { count: String(apps.length) })}
                        </button>
                        {appsPanelRole === role ? (
                          <div className={styles.slotAppsPanel} role="dialog">
                            <p className={styles.slotAppsPanelTitle}>
                              {t("dota.team.slotAppsTitle")}
                            </p>
                            <ul className={styles.slotApps}>
                              {apps.map((invite) => (
                                <li className={styles.slotApp} key={invite.id}>
                                  <div className={styles.slotAppCopy}>
                                    {invite.inviteeDotaSlug ? (
                                      <Link href={`/dota/${invite.inviteeDotaSlug}`}>
                                        {invite.inviteeDisplayName}
                                      </Link>
                                    ) : (
                                      <span>{invite.inviteeDisplayName}</span>
                                    )}
                                    <span className={styles.slotAppMeta}>
                                      {invite.inviteeMmr
                                        ? t("dota.team.slotAppMmr", { mmr: invite.inviteeMmr })
                                        : t("dota.team.slotAppMmrUnknown")}
                                    </span>
                                    {(invite.redFlags?.length ?? 0) > 0 ||
                                    (invite.greenFlags?.length ?? 0) > 0 ? (
                                      <div className={styles.slotAppFlags}>
                                        {(invite.redFlags ?? []).map((flag) => (
                                          <span
                                            className={styles.slotAppFlagRed}
                                            key={`${invite.id}-r-${flag.key}`}
                                          >
                                            {getDotaRedFlagLabel(flag.key as DotaRedFlagKey, t)}
                                            {flag.count > 1 ? ` · ${flag.count}` : ""}
                                          </span>
                                        ))}
                                        {(invite.greenFlags ?? []).map((flag) => (
                                          <span
                                            className={styles.slotAppFlagGreen}
                                            key={`${invite.id}-g-${flag.key}`}
                                          >
                                            {getDotaGreenFlagLabel(flag.key as DotaGreenFlagKey, t)}
                                            {flag.count > 1 ? ` · ${flag.count}` : ""}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className={styles.slotAppMeta}>
                                        {t("dota.team.slotAppFlagsEmpty")}
                                      </span>
                                    )}
                                  </div>
                                  <div className={styles.slotAppActions}>
                                    <button
                                      className="button-primary"
                                      disabled={
                                        applicationBusyId === invite.id || party.openSlots <= 0
                                      }
                                      onClick={() => void handleAcceptApplication(invite)}
                                      type="button"
                                    >
                                      {t("games.search.acceptApplication")}
                                    </button>
                                    <button
                                      className="button-secondary"
                                      disabled={applicationBusyId === invite.id}
                                      onClick={() => void handleDeclineApplication(invite)}
                                      type="button"
                                    >
                                      {t("games.search.declineApplication")}
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : recruiting ? (
                      <p className={styles.slotWaiting}>{t("dota.team.slotWaitingApps")}</p>
                    ) : null}
                  </>
                ) : party.isMember ? (
                  <>
                    <div className={styles.slotAvatarEmpty} aria-hidden="true">
                      +
                    </div>
                    <strong>
                      {recruiting ? t("dota.team.slotFreeLooking") : t("dota.team.openSlot")}
                    </strong>
                    <button
                      className={styles.slotPrimaryBtn}
                      disabled={pending}
                      onClick={() => void handleClaimSlot(role)}
                      type="button"
                    >
                      {t("dota.team.claimSlot")}
                    </button>
                  </>
                ) : visitorOpenRoles.includes(role) ||
                  (viewerInvite?.positionRole === role && !party.isMember) ? (
                  <>
                    <div className={styles.slotAvatarEmpty} aria-hidden="true">
                      +
                    </div>
                    <strong>
                      {viewerInvite?.positionRole === role
                        ? t("dota.team.invitedSlot")
                        : (party.joinMode ?? "CONFIRM") === "OPEN"
                          ? t("dota.team.joinModeOpen")
                          : t("dota.team.joinModeConfirmStatus")}
                    </strong>
                    <span className={styles.slotMeta}>
                      {viewerInvite?.positionRole === role
                        ? t("dota.team.youWereInvitedRole", {
                            role: `${role} ${getDotaPositionLabel(role, t)}`
                          })
                        : t("games.search.recruitCardRoles", {
                            roles: `${role} ${getDotaPositionLabel(role, t)}`
                          })}
                    </span>
                    {authSession && viewerInvite?.positionRole === role ? (
                      <button
                        className={styles.slotPrimaryBtn}
                        disabled={viewerInviteBusy}
                        onClick={() => void handleAcceptViewerInvite()}
                        type="button"
                      >
                        {viewerInviteBusy
                          ? t("common.loadingEllipsis")
                          : t("dota.team.acceptInvite")}
                      </button>
                    ) : authSession ? (
                      <button
                        className={styles.slotPrimaryBtn}
                        disabled={visitorApplyBusyRole === role || Boolean(viewerInvite)}
                        onClick={() => void handleVisitorApply(role)}
                        type="button"
                      >
                        {visitorApplyBusyRole === role
                          ? t("games.search.stackBusy")
                          : (party.joinMode ?? "CONFIRM") === "OPEN"
                            ? t("dota.team.joinForOpenRole", {
                                role: `${role} ${getDotaPositionLabel(role, t)}`
                              })
                            : t("dota.team.applyForOpenRole", {
                                role: `${role} ${getDotaPositionLabel(role, t)}`
                              })}
                      </button>
                    ) : (
                      <Link className={styles.slotSecondaryBtn} href="/dota/create">
                        {t("games.search.createCta")}
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <div className={styles.slotAvatarEmpty} aria-hidden="true">
                      +
                    </div>
                    <strong>{t("dota.team.openSlot")}</strong>
                    <span className={styles.slotMeta}>{t("dota.team.openSlotHint")}</span>
                  </>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      {visitorApplyError && !party.isMember ? (
        <div className={styles.visitorFeedback}>
          <FormFeedback errorMessage={visitorApplyError} />
        </div>
      ) : null}

      {canManageParty ? (
          <section className={styles.candidatesPanel}>
            <div className={styles.candidatesHead}>
              <div>
                <p className={styles.candidatesEyebrow}>{t("dota.team.candidatesEyebrow")}</p>
                <h2>{t("dota.team.candidatesTitle")}</h2>
              </div>
              <button
                aria-label={t("dota.team.candidatesRefresh")}
                className={styles.candidatesRefresh}
                disabled={!isRecruitLooking || recruitCandidatesLoading}
                onClick={() => void refreshRecruitCandidates({ advance: true })}
                type="button"
              >
                <span
                  aria-hidden
                  className={recruitCandidatesLoading ? styles.candidatesRefreshSpinning : ""}
                >
                  ↻
                </span>
                {recruitCandidatesLoading
                  ? t("common.loadingEllipsis")
                  : t("dota.team.candidatesRefresh")}
              </button>
            </div>

            {!isRecruitLooking ? (
              <p className={styles.candidatesEmpty}>
                {t(
                  party.kind === "PARTY"
                    ? "dota.team.candidatesIdleParty"
                    : "dota.team.candidatesIdleTeam"
                )}
              </p>
            ) : visibleRecruitCandidates.length === 0 ? (
              <p className={styles.candidatesEmpty}>{t("dota.team.candidatesEmpty")}</p>
            ) : (
              <div className={styles.candidatesGrid}>
                {visibleRecruitCandidates.map((candidate) => {
                  const matchingRoles = matchingRecruitRoles(candidate, effectiveRecruitRoles);
                  const greenFlags = candidate.greenFlags ?? [];
                  const redFlags = candidate.redFlags ?? [];

                  return (
                    <article className={styles.candidateCard} key={candidate.slug}>
                      <div className={styles.candidateTop}>
                        <div aria-hidden="true" className={styles.candidateAvatar}>
                          {partyMemberInitial(candidate.title)}
                        </div>
                        <div className={styles.candidateIdentity}>
                          <Link href={`/dota/${candidate.slug}`}>{candidate.title}</Link>
                          <span>
                            {candidate.mmr
                              ? `${candidate.mmr} MMR`
                              : t("dota.team.candidateMmrUnknown")}
                          </span>
                          {matchingRoles.length > 0 ? (
                            <span className={styles.candidateRoleBadge}>
                              {matchingRoles
                                .map((role) => getDotaPositionLabel(role, t))
                                .join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {(greenFlags.length > 0 || redFlags.length > 0) ? (
                        <div className={styles.candidateFlags}>
                          {greenFlags.length > 0 ? (
                            <div className={styles.candidateFlagCol}>
                              <p className={styles.candidateFlagLabel}>
                                {t("dota.team.candidateFlagsGreen")}
                              </p>
                              {greenFlags.map((flag) => (
                                <span
                                  className={styles.candidateFlagGreen}
                                  key={`${candidate.slug}-g-${flag.key}`}
                                >
                                  ✓ {getDotaGreenFlagLabel(flag.key as DotaGreenFlagKey, t)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {redFlags.length > 0 ? (
                            <div className={styles.candidateFlagCol}>
                              <p className={styles.candidateFlagLabel}>
                                {t("dota.team.candidateFlagsRed")}
                              </p>
                              {redFlags.map((flag) => (
                                <span
                                  className={styles.candidateFlagRed}
                                  key={`${candidate.slug}-r-${flag.key}`}
                                >
                                  ○ {getDotaRedFlagLabel(flag.key as DotaRedFlagKey, t)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className={styles.candidateActions}>
                        <Link
                          className={styles.candidateProfileBtn}
                          href={`/dota/${candidate.slug}`}
                        >
                          {t("dota.team.candidateViewProfile")}
                        </Link>
                        <div
                          aria-label={t("dota.team.candidateRoles")}
                          className={styles.candidateRoles}
                          role="group"
                        >
                          {matchingRoles.map((role) => {
                            const busyKey = `${candidate.slug}:${role}`;
                            return (
                              <button
                                disabled={recruitCandidateBusyKey !== null}
                                key={busyKey}
                                onClick={() => void handleInviteRecruitCandidate(candidate, role)}
                                title={t("dota.team.candidateInviteRole", {
                                  role: `${role} ${getDotaPositionLabel(role, t)}`
                                })}
                                type="button"
                              >
                                {recruitCandidateBusyKey === busyKey
                                  ? t("common.loadingEllipsis")
                                  : `${t("dota.team.candidateInvite")} · ${role}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {isRecruitLooking && recruitCandidates.length > RECRUIT_CANDIDATE_PAGE_SIZE ? (
              <p className={styles.candidatesQueue}>
                {t("dota.team.candidatesQueue", {
                  current: (recruitCandidateBatch % recruitCandidateBatchCount) + 1,
                  total: recruitCandidateBatchCount
                })}
              </p>
            ) : null}
            {recruitCandidateMessage ? (
              <p className={styles.candidatesSuccess}>{recruitCandidateMessage}</p>
            ) : null}
            {recruitCandidateError ? <FormFeedback errorMessage={recruitCandidateError} /> : null}
          </section>
      ) : null}
        </div>

        {party.isMember ? (
          <aside className={styles.chatPanel} aria-label={t("dota.team.chatTitle")}>
            <div className={styles.chatHead}>
              <div className={styles.chatHeadTop}>
                <h2>{t("dota.team.chatTitle")}</h2>
                <span className={styles.chatMembersBadge}>
                  {t("dota.team.chatMembersCount", { count: String(party.memberCount) })}
                </span>
              </div>
              <p className={styles.chatHint}>{t("dota.team.chatHint")}</p>
            </div>
            <div
              className={styles.chatMessages}
              onScroll={(event) => {
                shouldStickChatToBottomRef.current = isChatListNearBottom(event.currentTarget);
              }}
              ref={chatMessagesRef}
            >
              {chatMessages.length === 0 ? (
                <p className={styles.chatEmpty}>{t("dota.team.chatEmpty")}</p>
              ) : (
                chatMessages.map((message) => {
                  const display = resolveChatDisplayText(message.message, t);

                  return (
                    <article
                      className={`${styles.chatMessage}${display.isSystem ? ` ${styles.chatMessageSystem}` : ""}`}
                      key={message.id}
                    >
                      {display.isSystem ? null : (
                        <div aria-hidden="true" className={styles.chatAvatar}>
                          {partyMemberInitial(message.displayName)}
                        </div>
                      )}
                      <div className={styles.chatMessageBody}>
                        {display.isSystem ? null : <strong>{message.displayName}</strong>}
                        <span>{display.text}</span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <form className={styles.chatForm} onSubmit={handleSendChat}>
              <input
                maxLength={10000}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder={t("dota.team.chatPlaceholder")}
                value={chatDraft}
              />
              <button
                aria-label={t("dota.team.chatSend")}
                className={styles.chatSendBtn}
                disabled={chatPending || chatDraft.trim().length === 0}
                type="submit"
              >
                {chatPending ? "…" : "↑"}
              </button>
            </form>
            {chatError ? <FormFeedback errorMessage={chatError} /> : null}
          </aside>
        ) : (
          <aside className={styles.chatPanel} aria-label={t("dota.team.chatTitle")}>
            <div className={styles.chatHead}>
              <h2>{t("dota.team.chatTitle")}</h2>
              <p className={styles.chatHint}>{t("dota.team.chatMembersOnly")}</p>
            </div>
          </aside>
        )}
      </div>

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
