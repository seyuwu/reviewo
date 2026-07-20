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
import type { AuthResponse } from "../../auth/types/auth";
import { useTranslation } from "../../i18n/locale-provider";
import { getDiscordLinkUrl } from "../../profile/api/profile";
import { openDiscordPartyVoice } from "../../social/lib/discord-invite";
import {
  fetchDotaLfg,
  fetchMyDotaProfile,
  setDotaLfgLooking,
  type DotaLfgHit
} from "../api/dota-api";
import { trackDotaEvent } from "../lib/analytics";
import {
  acceptPartyInvite,
  claimPartySeat,
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
import { buildDotaTeamUrl } from "../lib/share";
import {
  buildPartyShortDisplayUrl,
  copyDotaPartyInviteMessage,
  reportPartyLinkOpen
} from "../lib/party-invite";
import { PartyAuthSheet } from "./party-auth-sheet";
import styles from "./dota-team-view.module.css";

const PENDING_PARTY_JOIN_KEY = "opinia.pendingPartyJoin";
const PENDING_PARTY_CLAIM_KEY = "opinia.pendingPartyClaim";
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

  // Short opaque join codes from Redis share links.
  if (!value.includes(".")) {
    return /^[A-Za-z0-9_-]{6,16}$/.test(value);
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

  if (message === "__system__:party_safety") {
    return { isSystem: true, text: t("dota.team.system.party_safety") };
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

/** Drop join/created query without App Router remount (SSR resets isMember=false). */
function stripTeamPageQuery(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (![...url.searchParams.keys()].length) {
    return;
  }

  url.search = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.hash}`);
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

  // party_view broadcasts set discordInviteUrl=null for everyone — members must keep
  // the last known invite while voice is still active (expiresAt present).
  let discordInviteUrl: string | null = incoming.discordInviteUrl ?? null;

  if (!discordInviteUrl && isMember) {
    discordInviteUrl = incoming.discordVoiceExpiresAt
      ? current.discordInviteUrl ?? null
      : null;
  }

  return {
    ...incoming,
    canManageParty: isOwner || isOfficer,
    discordInviteUrl,
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
  const { authSession, isAuthSessionLoaded, storeAuthSession } = useAuthSession();
  const { push: pushToast } = useNotificationToasts();
  const [party, setParty] = useState(initialParty);
  const canManageParty = Boolean(
    party.isOwner || party.isOfficer || party.canManageParty
  );
  const [expiryInfo, setExpiryInfo] = useState<ReturnType<typeof formatRemainingExpiry>>(null);
  const [voiceExpiryInfo, setVoiceExpiryInfo] = useState<ReturnType<typeof formatRemainingVoiceExpiry>>(
    null
  );
  const [renameEditing, setRenameEditing] = useState(false);
  const [extendHintDismissed, setExtendHintDismissed] = useState(false);
  const [extendVoiceBusy, setExtendVoiceBusy] = useState(false);
  const expiryWarnSentRef = useRef(false);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteHint, setInviteHint] = useState(false);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [claimIntentRole, setClaimIntentRole] = useState<DotaPositionRole | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState(() => buildDotaTeamUrl(initialParty.slug));
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [linkOpenCount, setLinkOpenCount] = useState(() =>
    typeof initialParty.linkOpenCount === "number" ? initialParty.linkOpenCount : 0
  );
  const [pending, setPending] = useState(false);
  const [discordVoiceBusy, setDiscordVoiceBusy] = useState(false);
  const [discordVoiceCopied, setDiscordVoiceCopied] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [friendBusyId, setFriendBusyId] = useState<string | null>(null);
  const [outgoingFriendIds, setOutgoingFriendIds] = useState<Set<string>>(() => new Set());
  const knownDiscordInviteRef = useRef(initialParty.discordInviteUrl ?? null);
  const discordVoiceReadyToastedRef = useRef(Boolean(initialParty.discordInviteUrl));
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
  const createdLandingHandledRef = useRef(false);
  const chatInFlightRef = useRef(false);
  const visitorClaimInFlightRef = useRef(false);
  /** Bumped on local mutations so in-flight softSync cannot overwrite fresher roster. */
  const partyMutationEpochRef = useRef(0);
  const claimInFlightRef = useRef(false);
  const partySocketRef = useRef<PartySocketConnection | null>(null);
  const canManagePartyRef = useRef(canManageParty);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatMessageCountRef = useRef(0);
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
      // Don't auto-open profile sheet — guest must click claim CTA first.
      setError(null);
      return;
    }

    let claimRole: DotaPositionRole | null = null;
    if (typeof window !== "undefined") {
      try {
        const claimRaw = window.sessionStorage.getItem(PENDING_PARTY_CLAIM_KEY);
        const parsed = claimRaw
          ? (JSON.parse(claimRaw) as { role?: DotaPositionRole; slug?: string })
          : null;
        if (parsed?.slug === party.slug && parsed.role) {
          claimRole = parsed.role;
        }
      } catch {
        claimRole = null;
      }
    }

    joinHandledRef.current = true;
    setPending(true);
    setError(null);

    void joinPartyByToken(token, authSession.accessToken, claimRole ?? undefined)
      .then((updated) => {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(PENDING_PARTY_JOIN_KEY);
          window.sessionStorage.removeItem(PENDING_PARTY_CLAIM_KEY);
        }
        setClaimIntentRole(null);
        setParty(updated);
        setJoinMessage(
          updated.isMember ? t("dota.team.joinSuccess") : t("games.search.applicationSent")
        );
        trackDotaEvent(updated.isMember ? "party_joined" : "party_applied", {
          ...(claimRole ? { role: claimRole } : {}),
          slug: updated.slug
        });
        setAuthSheetOpen(false);
        // Avoid router.replace remount — SSR party has isMember=false and wipes chat.
        stripTeamPageQuery();
        if (updated.isMember) {
          void fetchPartyChatMessages(updated.slug, authSession.accessToken)
            .then((page) => {
              pendingChatScrollToBottomRef.current = true;
              shouldStickChatToBottomRef.current = true;
              setChatMessages((current) => mergeChatMessages(current, page.messages));
            })
            .catch(() => {
              // Socket join / refreshLiveState will retry.
            });
        }
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
    t
  ]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    let cancelled = false;
    const accessToken = authSession.accessToken;
    const viewerUserId = authSession.userId;

    // Party + chat in parallel — don't wait for isMember flip before loading history.
    void Promise.all([
      fetchGameParty(initialParty.slug, accessToken),
      fetchPartyChatMessages(initialParty.slug, accessToken).catch(() => null)
    ])
      .then(([refreshed, chatPage]) => {
        if (cancelled) {
          return;
        }

        setParty((current) => applyLivePartyUpdate(current, refreshed, viewerUserId));
        setRenameDraft(refreshed.name);

        if (chatPage && refreshed.isMember) {
          pendingChatScrollToBottomRef.current = true;
          shouldStickChatToBottomRef.current = true;
          setChatMessages((current) => mergeChatMessages(current, chatPage.messages));
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
    chatMessageCountRef.current = chatMessages.length;
  }, [chatMessages]);

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
      // Only clear when logged out. SSR starts isMember=false — wiping here races the
      // auth party+chat prefetch and blanks history for someone who just joined.
      if (isAuthSessionLoaded && !authSession?.accessToken) {
        setChatMessages([]);
      }
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
      partySocketRef.current?.ensureJoined();
      const epochAtStart = partyMutationEpochRef.current;

      try {
        const socketReady = partySocketRef.current?.isReady() ?? false;
        const needChatHttp = !socketReady || chatMessageCountRef.current === 0;
        const [nextParty, lfg, myParties, chatPage] = await Promise.all([
          fetchGameParty(party.slug, authSession.accessToken),
          fetchDotaLfg(),
          canManagePartyRef.current
            ? fetchMyParties(authSession.accessToken)
            : Promise.resolve(null),
          // Always pull history if socket not ready OR chat still empty after join.
          needChatHttp
            ? fetchPartyChatMessages(party.slug, authSession.accessToken)
            : Promise.resolve(null)
        ]);

        if (cancelled || partyMutationEpochRef.current !== epochAtStart) {
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

        if (chatPage) {
          setChatMessages((current) => mergeChatMessages(current, chatPage.messages));
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
            // Merge — don't replace, so a late empty/partial ack cannot wipe HTTP prefetch.
            setChatMessages((current) => mergeChatMessages(current, messages));
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

            // Only toast once when voice first appears (null → url). Ignore re-broadcasts /
            // invite URL refreshes and party_view payloads that strip the invite.
            if (
              nextInvite &&
              !previousInvite &&
              !discordVoiceReadyToastedRef.current
            ) {
              discordVoiceReadyToastedRef.current = true;
              knownDiscordInviteRef.current = nextInvite;
              pushToast({
                body: t("dota.team.discordVoiceReadyBody"),
                ctaLabel: t("dota.team.discordVoiceJoin"),
                href: nextInvite,
                id: `discord-voice-ready-${nextParty.id}`,
                title: t("dota.team.discordVoiceReadyToast")
              });
            } else if (nextInvite) {
              knownDiscordInviteRef.current = nextInvite;
            } else if (
              nextParty.discordVoiceExpiresAt == null &&
              nextParty.discordInviteUrl == null
            ) {
              // Voice fully gone (explicit clear), allow a future ready toast.
              knownDiscordInviteRef.current = null;
              discordVoiceReadyToastedRef.current = false;
            }

            setParty((current) => applyLivePartyUpdate(current, nextParty, viewerUserId));

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

      const epochAtStart = partyMutationEpochRef.current;

      try {
        const [nextParty, chatPage, myParties, lfg] = await Promise.all([
          fetchGameParty(party.slug, authSession.accessToken),
          fetchPartyChatMessages(party.slug, authSession.accessToken),
          canManagePartyRef.current
            ? fetchMyParties(authSession.accessToken)
            : Promise.resolve(null),
          fetchDotaLfg()
        ]);

        if (cancelled || partyMutationEpochRef.current !== epochAtStart) {
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
      onConnected: () => {
        if (cancelled) {
          return;
        }

        void fetchGameParty(party.slug, authSession?.accessToken)
          .then((nextParty) => {
            if (!cancelled) {
              setParty((current) => applyLivePartyUpdate(current, nextParty, viewerUserId));
            }
          })
          .catch(() => {
            // Socket updates remain the fallback.
          });
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
    void softSyncVisitor();

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
  const guestCanClaimSeats = !party.isMember && party.openSlots > 0;
  const myMembership = authSession?.userId
    ? party.members.find((member) => member.userId === authSession.userId) ?? null
    : null;
  const averageMmr = (() => {
    const values = party.members
      .map((member) => Number(member.mmr))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) {
      return null;
    }
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  })();
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
        const response = await fetchDotaLfg({
          roles: openRoles,
          ...(authSession?.accessToken ? { accessToken: authSession.accessToken } : {})
        });
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
        discordVoiceReadyToastedRef.current = false;
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
  const captainMember =
    party.members.find((member) => member.role === "OWNER") ??
    party.members.find((member) => member.userId === party.ownerUserId) ??
    null;
  const seatsLeft = Math.max(0, party.maxMembers - party.memberCount);
  const seatsLeftLabel =
    seatsLeft === 0
      ? t("dota.team.seatsFull")
      : seatsLeft === 1
        ? t("dota.team.seatsLeftOne")
        : seatsLeft < 5
          ? t("dota.team.seatsLeft", { count: String(seatsLeft) })
          : t("dota.team.seatsLeftMany", { count: String(seatsLeft) });

  useEffect(() => {
    if (party.isMember) {
      if (typeof party.linkOpenCount === "number") {
        setLinkOpenCount(party.linkOpenCount);
      }
      return;
    }

    trackDotaEvent("party_landing_view", { slug: party.slug });
    void reportPartyLinkOpen(party.slug, authSession?.accessToken ?? undefined);
  }, [authSession?.accessToken, party.isMember, party.linkOpenCount, party.slug]);

  useEffect(() => {
    if (createdLandingHandledRef.current) {
      return;
    }

    if (searchParams.get("created") === "1" && party.isMember && authSession?.accessToken) {
      createdLandingHandledRef.current = true;
      trackDotaEvent("party_created", { kind: party.kind, slug: party.slug });
      void handleShare().then(() => {
        stripTeamPageQuery();
      });
    }
    // Intentionally once on created landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.accessToken, party.isMember, party.slug]);

  function neededRolesForInvite(): DotaPositionRole[] {
    const claimed = new Set(
      party.members
        .map((member) => member.positionRole)
        .filter((role): role is DotaPositionRole => Boolean(role))
    );
    return ROLE_POSITIONS.filter((role) => !claimed.has(role));
  }

  function rolesForInvite(): DotaPositionRole[] {
    if (isRecruitLooking && effectiveRecruitRoles.length > 0) {
      return [...effectiveRecruitRoles].sort();
    }

    return neededRolesForInvite();
  }

  async function prepareInviteToken(): Promise<string | null> {
    if (!authSession?.accessToken || !party.isMember) {
      return null;
    }

    const { code, token } = await createPartyJoinToken(party.slug, authSession.accessToken);
    const inviteCredential = code || token;
    setInviteToken(inviteCredential);
    return inviteCredential;
  }

  async function handleShareWallCopy(): Promise<boolean> {
    try {
      const token =
        inviteToken ??
        (authSession?.accessToken && party.isMember ? await prepareInviteToken() : null);
      const result = await copyDotaPartyInviteMessage(party, token, t, rolesForInvite());
      setInviteMessage(result.message);
      setInviteUrl(result.url);
      setCopied(result.ok);
      if (result.ok) {
        trackDotaEvent("party_invite_copied", { slug: party.slug });
        window.setTimeout(() => setCopied(false), 1800);
      }
      return result.ok;
    } catch {
      setError(t("dota.team.inviteError"));
      return false;
    }
  }

  async function handleShare() {
    const ok = await handleShareWallCopy();
    if (ok) {
      setInviteHint(true);
      window.setTimeout(() => setInviteHint(false), 4500);
    }

    if (!canManageParty || lookingBusy) {
      return;
    }

    // Already recruiting some roles — only copy invite, don't expand search to all empty slots.
    if (isRecruitLooking && effectiveRecruitRoles.length > 0) {
      return;
    }

    const emptyRoles = ROLE_POSITIONS.filter((role) => !claimedRoles.has(role));
    if (emptyRoles.length === 0) {
      return;
    }

    await syncRecruitLooking(emptyRoles);
  }

  function openClaimAuth(role: DotaPositionRole | null) {
    setClaimIntentRole(role);
    if (typeof window !== "undefined" && role) {
      window.sessionStorage.setItem(
        PENDING_PARTY_CLAIM_KEY,
        JSON.stringify({ role, slug: party.slug })
      );
    }
    trackDotaEvent("party_seat_intent", {
      ...(role ? { role } : {}),
      slug: party.slug
    });
    setAuthSheetOpen(true);
  }

  async function resumeClaimAfterAuth(accessToken: string) {
    let role = claimIntentRole;
    if (!role && typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(PENDING_PARTY_CLAIM_KEY);
        const parsed = raw ? (JSON.parse(raw) as { role?: DotaPositionRole; slug?: string }) : null;
        if (parsed?.slug === party.slug && parsed.role) {
          role = parsed.role;
        }
      } catch {
        role = null;
      }
    }

    if (!role) {
      setAuthSheetOpen(false);
      return;
    }

    try {
      await fetchMyDotaProfile(accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // Sheet creates short Dota profile (MMR + roles); keep it open.
        setAuthSheetOpen(true);
        return;
      }
    }

    setAuthSheetOpen(false);
    setClaimIntentRole(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PENDING_PARTY_CLAIM_KEY);
    }
    await handleVisitorApply(role, accessToken);
  }

  function handlePartyAuthSuccess(authResponse: AuthResponse) {
    storeAuthSession(authResponse);
    const token = authResponse.accessToken;
    if (!token) {
      setAuthSheetOpen(false);
      return;
    }

    const pendingRaw =
      typeof window !== "undefined" ? window.sessionStorage.getItem(PENDING_PARTY_JOIN_KEY) : null;
    if (pendingRaw || joinTokenFromUrl) {
      setAuthSheetOpen(false);
      return;
    }

    void resumeClaimAfterAuth(token);
  }

  async function handleGuestClaim(role: DotaPositionRole) {
    if (viewerInvite?.positionRole === role && authSession?.accessToken) {
      trackDotaEvent("party_seat_intent", { role, slug: party.slug });
      await handleAcceptViewerInvite();
      return;
    }

    if (!authSession?.accessToken) {
      openClaimAuth(role);
      return;
    }

    trackDotaEvent("party_seat_intent", { role, slug: party.slug });

    try {
      await fetchMyDotaProfile(authSession.accessToken);
    } catch (profileError) {
      if (profileError instanceof ApiError && profileError.status === 404) {
        openClaimAuth(role);
        return;
      }
    }

    await handleVisitorApply(role);
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
        discordVoiceReadyToastedRef.current = true;
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

  async function handleVisitorApply(role: DotaPositionRole, accessTokenOverride?: string) {
    const accessToken = accessTokenOverride ?? authSession?.accessToken;
    if (
      !accessToken ||
      party.isMember ||
      visitorApplyBusyRole ||
      visitorClaimInFlightRef.current
    ) {
      return;
    }

    visitorClaimInFlightRef.current = true;
    partyMutationEpochRef.current += 1;
    setVisitorApplyBusyRole(role);
    setVisitorApplyError(null);

    try {
      const updated = await claimPartySeat(party.slug, role, accessToken);
      partyMutationEpochRef.current += 1;
      if (updated.isMember) {
        setParty((current) =>
          applyLivePartyUpdate(
            current,
            updated,
            authSession?.userId ?? updated.members[0]?.userId
          )
        );
        setVisitorOpenRoles([]);
        setJoinMessage(t("dota.team.joinSuccess"));
        trackDotaEvent("party_joined", { role, slug: party.slug });
        void fetchPartyChatMessages(party.slug, accessToken)
          .then((page) => {
            pendingChatScrollToBottomRef.current = true;
            shouldStickChatToBottomRef.current = true;
            setChatMessages((current) => mergeChatMessages(current, page.messages));
          })
          .catch(() => {
            // Member socket effect will load history.
          });
      } else {
        setVisitorOpenRoles((current) => current.filter((item) => item !== role));
        setJoinMessage(t("games.search.applicationSent"));
        trackDotaEvent("party_applied", { role, slug: party.slug });
        setParty((current) =>
          applyLivePartyUpdate(current, updated, authSession?.userId ?? undefined)
        );
      }
    } catch (applyError) {
      setVisitorApplyError(resolveStackInviteError(applyError, t));
    } finally {
      visitorClaimInFlightRef.current = false;
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
      trackDotaEvent("party_joined", {
        ...(viewerInvite.positionRole ? { role: viewerInvite.positionRole } : {}),
        slug: joined.slug
      });
      if (joined.isMember) {
        void fetchPartyChatMessages(joined.slug, authSession.accessToken)
          .then((page) => {
            pendingChatScrollToBottomRef.current = true;
            shouldStickChatToBottomRef.current = true;
            setChatMessages((current) => mergeChatMessages(current, page.messages));
          })
          .catch(() => {
            // Member socket effect will load history.
          });
      }
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
    if (!authSession?.accessToken || !party.isMember || claimInFlightRef.current) {
      return;
    }

    claimInFlightRef.current = true;
    partyMutationEpochRef.current += 1;
    setPending(true);
    setError(null);

    const viewerId = authSession.userId;
    // Optimistic: show seat occupied immediately; softSync cannot clobber (epoch).
    setParty((current) => ({
      ...current,
      members: current.members.map((member) => {
        if (member.userId === viewerId) {
          return { ...member, positionRole: role };
        }
        if (member.positionRole === role) {
          return { ...member, positionRole: null };
        }
        return member;
      })
    }));
    setRecruitRoles((current) => {
      const next = current.filter((item) => item !== role);
      if (next.length === 0) {
        setIsRecruitLooking(false);
      }
      return next;
    });

    try {
      const updated = await updatePartyMemberPosition(party.slug, role, authSession.accessToken);
      partyMutationEpochRef.current += 1;
      setParty((current) => applyLivePartyUpdate(current, updated, viewerId));
    } catch (claimError) {
      partyMutationEpochRef.current += 1;
      setError(
        claimError instanceof ApiError
          ? resolveStackInviteError(claimError, t)
          : t("dota.team.claimError")
      );
      try {
        const refreshed = await fetchGameParty(party.slug, authSession.accessToken);
        setParty((current) => applyLivePartyUpdate(current, refreshed, viewerId));
      } catch {
        // Keep optimistic state if refresh fails.
      }
    } finally {
      claimInFlightRef.current = false;
      setPending(false);
    }
  }

  async function handleClearSlot() {
    if (!authSession?.accessToken || !party.isMember || claimInFlightRef.current) {
      return;
    }

    claimInFlightRef.current = true;
    partyMutationEpochRef.current += 1;
    setPending(true);
    setError(null);

    try {
      const updated = await updatePartyMemberPosition(party.slug, null, authSession.accessToken);
      partyMutationEpochRef.current += 1;
      setParty((current) => applyLivePartyUpdate(current, updated, authSession.userId));
    } catch {
      setError(t("dota.team.claimError"));
    } finally {
      claimInFlightRef.current = false;
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

    if ((party.joinMode ?? "OPEN") === nextMode) {
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

    if (
      !authSession?.accessToken ||
      chatDraft.trim().length === 0 ||
      chatPending ||
      chatInFlightRef.current
    ) {
      return;
    }

    const text = chatDraft.trim();
    chatInFlightRef.current = true;
    setChatPending(true);
    setChatError(null);
    setChatDraft("");

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
        // HTTP path means socket likely out of room — rejoin so we receive replies.
        partySocketRef.current?.ensureJoined();
      }

      requestChatScrollToBottom();
      setChatMessages((current) => mergeChatMessages(current, [created!]));
    } catch {
      setChatDraft(text);
      setChatError(t("dota.team.chatSendError"));
    } finally {
      chatInFlightRef.current = false;
      setChatPending(false);
    }
  }

  return (
    <section className={styles.page}>
      <div aria-hidden className={styles.pageBackdrop}>
        <img
          alt=""
          className={styles.pageBackdropArt}
          src="/dota/idle/party-slots-arena.png"
        />
        <div className={styles.pageBackdropVeil} />
      </div>
      <div className={styles.workspace}>
        <div
          className={styles.rosterColumn}
        >
          <header className={styles.hero}>
            <div className={styles.heroTop}>
              <div className={styles.heroCopy}>
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
                {captainMember ? (
                  <p className={styles.captainRow}>
                    <span aria-hidden>👑</span>
                    {t("dota.team.captainLabel")} ·{" "}
                    {captainMember.dotaSlug ? (
                      <Link href={`/dota/${captainMember.dotaSlug}`}>{captainMember.displayName}</Link>
                    ) : (
                      <strong>{captainMember.displayName}</strong>
                    )}
                    {captainMember.mmr ? (
                      <span className={styles.captainMeta}> · ≈ {captainMember.mmr} MMR</span>
                    ) : null}
                  </p>
                ) : null}
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

            <div className={styles.statusStrip}>
              <div className={styles.statusBlock}>
                <p className={styles.statusValue}>
                  {t("dota.team.playersCount", {
                    current: String(party.memberCount),
                    max: String(party.maxMembers)
                  })}
                </p>
                <div aria-hidden className={styles.progressDots}>
                  {Array.from({ length: party.maxMembers }, (_, index) => (
                    <span
                      className={`${styles.progressDot}${
                        index < party.memberCount ? ` ${styles.progressDotOn}` : ""
                      }`}
                      key={`dot-${index}`}
                    />
                  ))}
                </div>
              </div>

              <div className={`${styles.statusBlock} ${styles.seatsBlock}`}>
                <p className={styles.seatsLeft}>{seatsLeftLabel}</p>
              </div>

              {canManageParty && party.openSlots > 0 ? (
                <div className={styles.statusBlock}>
                  <p className={styles.statusLabel}>{t("dota.team.joinModeLabel")}</p>
                  <button
                    className={styles.joinModeSelect}
                    disabled={joinModeBusy}
                    onClick={() =>
                      void handleJoinModeChange(
                        (party.joinMode ?? "OPEN") === "OPEN" ? "CONFIRM" : "OPEN"
                      )
                    }
                    type="button"
                  >
                    <span>
                      {(party.joinMode ?? "OPEN") === "OPEN"
                        ? `⚡ ${t("dota.team.joinModeOpen")}`
                        : `🛡 ${t("dota.team.joinModeConfirm")}`}
                    </span>
                    <span aria-hidden>▾</span>
                  </button>
                  {joinModeError ? <p className={styles.joinModeError}>{joinModeError}</p> : null}
                </div>
              ) : (
                <div className={styles.statusBlock}>
                  <p className={styles.statusLabel}>{t("dota.team.joinModeLabel")}</p>
                  <p className={styles.statusValue}>
                    {(party.joinMode ?? "OPEN") === "OPEN"
                      ? `⚡ ${t("dota.team.joinModeOpen")}`
                      : `🛡 ${t("dota.team.joinModeConfirm")}`}
                  </p>
                </div>
              )}

              {expiryInfo ? (
                <div className={styles.statusBlock}>
                  <p className={styles.statusLabel}>{t("dota.team.timeLeftLabel")}</p>
                  <div className={styles.timerRow}>
                    <p
                      className={`${styles.statusValue}${
                        expiryInfo.urgent ? ` ${styles.expiryUrgent}` : ""
                      }`}
                    >
                      {expiryInfo.label}
                    </p>
                    {party.canExtendParty ? (
                      <button
                        className={styles.extendChip}
                        disabled={extendBusy}
                        onClick={() => void handleExtendParty()}
                        type="button"
                      >
                        {extendBusy
                          ? t("common.loadingEllipsis")
                          : t("dota.team.extendCta", {
                              hours: String(DOTA_TEMP_PARTY_EXTEND_HOURS)
                            })}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {authSession &&
              party.isMember &&
              party.discordVoiceAvailable &&
              canManageParty ? (
                <div className={`${styles.statusBlock} ${styles.voiceBlock}`}>
                  <p className={styles.statusLabel}>{t("dota.team.discordVoiceReady")}</p>
                  <button
                    className={styles.voiceJoinBtn}
                    disabled={discordVoiceBusy}
                    onClick={() => void handleDiscordVoice("open")}
                    type="button"
                  >
                    {discordVoiceBusy
                      ? t("common.loadingEllipsis")
                      : party.discordInviteUrl
                        ? t("dota.team.discordVoiceJoin")
                        : t("dota.team.discordVoiceCreate")}
                  </button>
                </div>
              ) : null}
            </div>

            {joinMessage ? <p className={styles.lead}>{joinMessage}</p> : null}
            {canManageParty && pendingApplications.length > 0 ? (
              <p className={styles.appsHint}>
                {t("dota.team.appsOnSlotsHint", { count: String(pendingApplications.length) })}
              </p>
            ) : null}
            {party.memberCount <= 1 && canManageParty ? (
              <p className={styles.nobodyJoined}>{t("dota.team.nobodyJoinedYet")}</p>
            ) : null}

            <div className={styles.findPlayersWrap}>
              {viewerInvite && !party.isMember ? (
                <div className={styles.findPlayersRow}>
                  <button
                    className={styles.findPlayersBtn}
                    disabled={viewerInviteBusy}
                    onClick={() => void handleAcceptViewerInvite()}
                    type="button"
                  >
                    <span className={styles.findPlayersLabel}>
                      {viewerInviteBusy ? t("common.loadingEllipsis") : t("dota.team.acceptInvite")}
                    </span>
                  </button>
                  <button
                    className={styles.actionSecondary}
                    disabled={viewerInviteBusy}
                    onClick={() => void handleDeclineViewerInvite()}
                    type="button"
                  >
                    {t("dota.team.declineInvite")}
                  </button>
                </div>
              ) : party.isMember ? (
                <>
                  <button
                    className={styles.findPlayersBtn}
                    onClick={() => void handleShare()}
                    type="button"
                  >
                    <span className={styles.findPlayersLabel}>
                      <span aria-hidden>👥</span>
                      {copied ? t("dota.team.copied") : t("dota.team.inviteCta")}
                    </span>
                    {linkOpenCount > 0 ? (
                      <span className={styles.findPlayersOpens}>
                        {linkOpenCount === 1
                          ? t("dota.team.linkOpensOne", { count: String(linkOpenCount) })
                          : t("dota.team.linkOpens", { count: String(linkOpenCount) })}
                      </span>
                    ) : null}
                  </button>
                  {inviteHint ? (
                    <p className={styles.inviteCopiedHint}>{t("dota.team.shareWallSendHint")}</p>
                  ) : null}
                </>
              ) : (
                <p className={styles.findPlayersHint}>{t("dota.team.ghostHere")}</p>
              )}
              {party.isMember ? (
                <p className={styles.findPlayersHint}>
                  {t("dota.team.findPlayersHint")}
                  <span aria-hidden className={styles.findPlayersArrow}>
                    →
                  </span>
                </p>
              ) : null}
            </div>

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

          {(lookingError || applicationError || error) && (canManageParty || party.isMember) ? (
            <div className={styles.rosterFeedback}>
              <FormFeedback errorMessage={error ?? lookingError ?? applicationError} />
            </div>
          ) : null}

          <div className={styles.slots}>
            {positionSlots.map(({ apps, member, recruiting, role }) => {
              const isGuestClaimable = !member && guestCanClaimSeats;
              const isGhostSeat = isGuestClaimable;
              const isInvitedSeat = viewerInvite?.positionRole === role && !party.isMember;

              return (
          <article
            className={`${styles.slot}${member ? "" : ` ${styles.slotEmpty}`}${
              recruiting ? ` ${styles.slotRecruiting}` : ""
            }${isGhostSeat ? ` ${styles.slotGhost}` : ""}${
              appsPanelRole === role ? ` ${styles.slotAppsOpen}` : ""
            }`}
            data-role={role}
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
                  <div className={styles.slotIdRow}>
                    <button
                      className={styles.dotaIdButton}
                      onClick={() =>
                        void handleCopyMemberDotaId(member.userId, member.dotaAccountId!)
                      }
                      title={t("dota.profile.dotaIdCopyHint")}
                      type="button"
                    >
                      {copiedDotaIdUserId === member.userId
                        ? t("dota.team.memberDotaIdCopied")
                        : t("dota.team.memberDotaId", { id: member.dotaAccountId })}
                    </button>
                  </div>
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
                  {(canManageParty &&
                    member.role !== "OWNER" &&
                    (party.isOwner || member.role === "MEMBER")) ||
                  (party.isOwner &&
                    (member.role === "MEMBER" || member.role === "OFFICER")) ? (
                    <div className={styles.slotManageRow}>
                      {canManageParty &&
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
                          className={styles.officerButton}
                          disabled={pending}
                          onClick={() => void handleToggleOfficer(member.userId, true)}
                          type="button"
                        >
                          {t("dota.team.makeOfficer")}
                        </button>
                      ) : null}
                      {party.isOwner && member.role === "OFFICER" ? (
                        <button
                          className={styles.officerButton}
                          disabled={pending}
                          onClick={() => void handleToggleOfficer(member.userId, false)}
                          type="button"
                        >
                          {t("dota.team.removeOfficer")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {canManageParty ? (
                  <>
                    {recruiting ? (
                      <p className={styles.slotLookingCopy}>
                        <span className={styles.slotLookingText}>
                          {t("dota.team.slotLookingForSeat")}
                        </span>
                        <span aria-hidden="true" className={styles.slotLookingDots} />
                      </p>
                    ) : (
                      <>
                        <div className={styles.slotAvatarEmpty} aria-hidden="true">
                          +
                        </div>
                        <strong>{t("dota.team.openSlot")}</strong>
                      </>
                    )}
                    <div className={styles.slotActions}>
                      {party.isMember ? (
                        <button
                          className={`${styles.slotPrimaryBtn} ${styles.slotWantRoleBtn}`}
                          disabled={pending}
                          onClick={() => void handleClaimSlot(role)}
                          type="button"
                        >
                          {t("dota.team.wantThisRole")}
                        </button>
                      ) : null}
                      <button
                        className={`${styles.slotSecondaryBtn} ${styles.slotFindBtn}${
                          recruiting ? ` ${styles.slotFindBtnActive}` : ""
                        }`}
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
                              <span className={styles.slotAppsPanelCount}>{apps.length}</span>
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
                    ) : null}
                  </>
                ) : party.isMember ? (
                  <>
                    {recruiting ? (
                      <p className={styles.slotLookingCopy}>
                        <span className={styles.slotLookingText}>
                          {t("dota.team.slotLookingForSeat")}
                        </span>
                        <span aria-hidden="true" className={styles.slotLookingDots} />
                      </p>
                    ) : (
                      <>
                        <div className={styles.slotAvatarEmpty} aria-hidden="true">
                          +
                        </div>
                        <strong>{t("dota.team.openSlot")}</strong>
                      </>
                    )}
                    <button
                      className={`${styles.slotPrimaryBtn} ${styles.slotWantRoleBtn}`}
                      disabled={pending}
                      onClick={() => void handleClaimSlot(role)}
                      type="button"
                    >
                      {t("dota.team.wantThisRole")}
                    </button>
                  </>
                ) : isGuestClaimable ? (
                  <>
                    <div
                      aria-hidden="true"
                      className={`${styles.slotAvatarEmpty} ${styles.slotAvatarGhost}`}
                    >
                      ?
                    </div>
                    <strong>
                      {isInvitedSeat ? t("dota.team.invitedSlot") : t("dota.team.ghostHere")}
                    </strong>
                    <span className={styles.slotMeta}>
                      {isInvitedSeat
                        ? t("dota.team.youWereInvitedRole", {
                            role: `${role} ${getDotaPositionLabel(role, t)}`
                          })
                        : t("games.search.recruitCardRoles", {
                            roles: `${role} ${getDotaPositionLabel(role, t)}`
                          })}
                    </span>
                    <button
                      className={`${styles.slotPrimaryBtn}${
                        !isInvitedSeat && (party.joinMode ?? "OPEN") === "OPEN"
                          ? ` ${styles.slotClaimOpenBtn}`
                          : ""
                      }`}
                      disabled={
                        visitorApplyBusyRole !== null ||
                        viewerInviteBusy ||
                        (Boolean(viewerInvite) && viewerInvite?.positionRole !== role)
                      }
                      onClick={() => void handleGuestClaim(role)}
                      type="button"
                    >
                      {visitorApplyBusyRole !== null ||
                      (viewerInviteBusy && viewerInvite?.positionRole === role)
                        ? t("common.loadingEllipsis")
                        : isInvitedSeat
                          ? t("dota.team.acceptInvite")
                          : (party.joinMode ?? "OPEN") === "OPEN"
                            ? t("dota.team.claimSeatOpen")
                            : t("dota.team.claimSeatConfirm")}
                    </button>
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
              );
            })}
      </div>

      {visitorApplyError && !party.isMember ? (
        <div className={styles.visitorFeedback}>
          <FormFeedback errorMessage={visitorApplyError} />
        </div>
      ) : null}

      {canManageParty ? (
          <section
            className={`${styles.candidatesPanel}${
              !isRecruitLooking || visibleRecruitCandidates.length === 0
                ? ` ${styles.candidatesPanelEmpty}`
                : ""
            }`}
          >
            {!isRecruitLooking || visibleRecruitCandidates.length === 0 ? (
              <img
                alt=""
                aria-hidden
                className={styles.candidatesPanelBg}
                src="/dota/party-candidates-bg.png"
              />
            ) : null}
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

            {!isRecruitLooking || visibleRecruitCandidates.length === 0 ? (
              <div className={styles.candidatesEmptyState}>
                <div className={styles.candidatesEmptyCopy}>
                  <p className={styles.candidatesEmpty}>{t("dota.team.candidatesEmptyCta")}</p>
                  <button
                    className={styles.findPlayersBtnSmall}
                    onClick={() => void handleShare()}
                    type="button"
                  >
                    👥 {t("dota.team.inviteCta")}
                  </button>
                </div>
              </div>
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
      ) : party.isMember && party.discordVoiceAvailable ? (
          <section
            aria-label={t("dota.team.discordVoiceReady")}
            className={`${styles.candidatesPanel} ${styles.candidatesPanelEmpty} ${styles.memberVoicePanel}`}
          >
            <img
              alt=""
              aria-hidden
              className={styles.candidatesPanelBg}
              src="/dota/party-candidates-bg.png"
            />
            <div className={styles.memberVoiceState}>
              <p className={styles.memberVoiceLabel}>{t("dota.team.discordVoiceReady")}</p>
              <button
                className={styles.memberVoiceJoinBtn}
                disabled={discordVoiceBusy || !authSession?.accessToken}
                onClick={() => void handleDiscordVoice("open")}
                type="button"
              >
                {discordVoiceBusy
                  ? t("common.loadingEllipsis")
                  : party.discordInviteUrl
                    ? t("dota.team.discordVoiceJoin")
                    : t("dota.team.discordVoiceCreate")}
              </button>
              {voiceExpiryInfo ? (
                <p
                  className={`${styles.memberVoiceMeta}${
                    voiceExpiryInfo.urgent ? ` ${styles.expiryUrgent}` : ""
                  }`}
                >
                  {voiceExpiryInfo.label}
                </p>
              ) : null}
            </div>
          </section>
      ) : null}
        </div>

        {party.isMember ? (
          <div className={styles.sideColumn}>
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

          <aside
            className={`${styles.quickInvite}${inviteHint ? ` ${styles.quickInvitePulse}` : ""}`}
            aria-label={t("dota.team.quickInviteTitle")}
          >
            <p className={styles.quickInviteEyebrow}>{t("dota.team.quickInviteTitle")}</p>
            <div className={styles.quickInviteUrlRow}>
              <code>{buildPartyShortDisplayUrl(party.slug, inviteToken)}</code>
              <button
                className={styles.quickInviteCopy}
                onClick={() => void handleShareWallCopy()}
                type="button"
              >
                {copied ? "✓" : "⧉"}
              </button>
            </div>
            <p className={styles.quickInviteOr}>{t("dota.team.quickInviteOrApp")}</p>
            <div className={styles.quickInviteChannels}>
              <button
                className={styles.quickChannel}
                onClick={() => {
                  trackDotaEvent("party_invite_open_discord", { slug: party.slug });
                  void handleShareWallCopy().then((ok) => {
                    if (ok) {
                      window.open("https://discord.com/app", "_blank", "noopener,noreferrer");
                    }
                  });
                }}
                type="button"
              >
                <span aria-hidden className={styles.quickChannelIcon}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.02.02.05.03.08.02c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z" />
                  </svg>
                </span>
                Discord
              </button>
              <a
                className={styles.quickChannel}
                href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(inviteMessage || party.name)}`}
                onClick={() =>
                  trackDotaEvent("party_invite_share_channel", {
                    channel: "telegram",
                    slug: party.slug
                  })
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                <span aria-hidden className={styles.quickChannelIcon}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 6.82l-1.55 7.31c-.12.53-.43.66-.87.41l-2.4-1.77l-1.16 1.12c-.13.13-.24.24-.49.24l.17-2.43l4.42-4c.19-.17-.04-.27-.3-.1l-5.46 3.44l-2.35-.74c-.51-.16-.52-.51.11-.76l9.18-3.54c.42-.17.8.1.66.72z" />
                  </svg>
                </span>
                Telegram
              </a>
              <a
                className={styles.quickChannel}
                href={`https://vk.com/share.php?url=${encodeURIComponent(inviteUrl)}`}
                onClick={() =>
                  trackDotaEvent("party_invite_share_channel", {
                    channel: "vk",
                    slug: party.slug
                  })
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                <span aria-hidden className={styles.quickChannelIcon}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.785 16.5h.94s.285-.032.43-.192c.135-.147.13-.424.13-.424s-.018-1.292.58-1.483c.59-.188 1.347 1.25 2.148 1.804c.606.42 1.067.328 1.067.328l2.145-.03s1.12-.07.59-.95c-.043-.072-.31-.655-1.596-1.854c-1.348-1.256-1.167-1.053.456-3.227c.988-1.325 1.383-2.134 1.26-2.48c-.118-.33-.845-.243-.845-.243l-2.414.015s-.18-.025-.312.055c-.128.078-.21.26-.21.26s-.378 1.005-.88 1.86c-1.06 1.803-1.485 1.898-1.658 1.786c-.402-.26-.301-1.046-.301-1.604c0-1.743.264-2.47-.514-2.66c-.258-.063-.448-.105-1.107-.112c-.847-.009-1.564.003-1.97.203c-.27.134-.478.432-.351.449c.157.021.512.096.701.353c.244.332.235 1.077.235 1.077s.14 2.05-.327 2.305c-.32.175-.76-.182-1.704-1.815c-.483-.836-.848-1.76-.848-1.76s-.07-.173-.196-.266c-.152-.112-.365-.148-.365-.148l-2.293.015s-.344.01-.47.16c-.112.132-.009.405-.009.405s1.78 4.165 3.795 6.265c1.848 1.926 3.944 1.8 3.944 1.8z" />
                  </svg>
                </span>
                VK
              </a>
            </div>
          </aside>
          </div>
        ) : (
          <aside className={styles.chatPanel} aria-label={t("dota.team.chatTitle")}>
            <div className={styles.chatHead}>
              <h2>{t("dota.team.chatTitle")}</h2>
              <p className={styles.chatHint}>{t("dota.team.chatMembersOnly")}</p>
            </div>
          </aside>
        )}
      </div>

      <footer className={styles.metaFooter}>
        <p className={styles.metaLine}>
          {party.kind === "PARTY" ? kindLabel : kindLabel}
          {expiryInfo ? ` · ${expiryInfo.label}` : ""}
          {averageMmr != null
            ? ` · ${t("dota.team.avgMmr", { mmr: String(averageMmr) })}`
            : ` · ${t("dota.team.avgMmrUnknown")}`}
        </p>
        {authSession && party.isMember ? (
          <button
            className={styles.leaveFooterBtn}
            disabled={pending}
            onClick={() => void handleLeave()}
            type="button"
          >
            <span aria-hidden className={styles.leaveFooterIcon}>
              <svg fill="none" viewBox="0 0 24 24">
                <path
                  d="M10 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <path
                  d="M15 12H3m0 0 3-3m-3 3 3 3"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
            {party.isOwner && party.members.length > 1
              ? t("games.community.disbandRoster")
              : t("dota.team.leave")}
          </button>
        ) : null}
      </footer>

      <PartyAuthSheet
        onAuthSuccess={handlePartyAuthSuccess}
        onClose={() => {
          setAuthSheetOpen(false);
          setClaimIntentRole(null);
        }}
        open={authSheetOpen}
        preferredRole={claimIntentRole}
      />

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
      router.push(`/dota/teams/${party.slug}?created=1`);
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
