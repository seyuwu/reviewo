"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TranslateFn } from "@reviewo/i18n";

import { DOTA_PARTY_SIZE, DOTA_TEMP_PARTY_TTL_HOURS, type DotaGreenFlagKey, type DotaRedFlagKey } from "@reviewo/shared";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { isChatListNearBottom } from "../../entity-chat/lib/chat-ui-helpers";
import {
  resolveInviteDecisionError,
  resolveStackInviteError
} from "../../games/lib/resolve-stack-invite-error";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { fetchDotaLfg, fetchMyDotaProfile, setDotaLfgLooking } from "../api/dota-api";
import {
  acceptPartyInvite,
  createGameParty,
  createPartyJoinToken,
  declinePartyInvite,
  disbandGameParty,
  fetchFriends,
  fetchGameParty,
  fetchMyParties,
  fetchPartyChatMessages,
  inviteFriendToParty,
  joinPartyByToken,
  kickGamePartyMember,
  leaveGameParty,
  renameGameParty,
  sendPartyChatMessage,
  stackWithPlayer,
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
const ROLE_POSITIONS = ["1", "2", "3", "4", "5"] as const satisfies readonly DotaPositionRole[];
/** Soft resync only on tab focus / socket reconnect — not a timer poll. */
const TEAM_SOFT_SYNC_MIN_GAP_MS = 12_000;

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

function formatExpiry(
  expiresAt: string | null,
  t: ReturnType<typeof useTranslation>,
  locale: "en" | "ru"
): string | null {
  if (!expiresAt) {
    return null;
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const time = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric"
  }).format(date);

  return t("dota.team.expiresAt", { time });
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
      isMember: current.isMember,
      isOfficer: Boolean(current.isOfficer),
      isOwner: current.isOwner
    };
  }

  const isOwner = incoming.ownerUserId === viewerUserId;
  const isOfficer = incoming.members.some(
    (member) => member.userId === viewerUserId && member.role === "OFFICER"
  );

  return {
    ...incoming,
    canManageParty: isOwner || isOfficer,
    isMember: incoming.members.some((member) => member.userId === viewerUserId),
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

export function DotaTeamView({ party: initialParty }: DotaTeamViewProps) {
  const t = useTranslation();
  const { isLocaleHydrated, resolvedLocale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [party, setParty] = useState(initialParty);
  const canManageParty = Boolean(
    party.isOwner || party.isOfficer || party.canManageParty
  );
  const [expiryLabel, setExpiryLabel] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
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
  const [hasDotaProfile, setHasDotaProfile] = useState<boolean | null>(null);
  const [visitorOpenRoles, setVisitorOpenRoles] = useState<DotaPositionRole[]>([]);
  const [visitorApplyBusyRole, setVisitorApplyBusyRole] = useState<DotaPositionRole | null>(null);
  const [visitorApplyError, setVisitorApplyError] = useState<string | null>(null);
  const [viewerInvite, setViewerInvite] = useState<GamePartyInvite | null>(null);
  const [viewerInviteBusy, setViewerInviteBusy] = useState(false);
  const [viewerInviteError, setViewerInviteError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState(initialParty.name);
  const [renaming, setRenaming] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [copiedDotaIdUserId, setCopiedDotaIdUserId] = useState<string | null>(null);
  const [friendInviteQuery, setFriendInviteQuery] = useState("");
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

    const stillHasApps = applications.some(
      (invite) => invite.positionRole === appsPanelRole && invite.status === "PENDING"
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
  }, [applications, appsPanelRole]);

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
        setJoinMessage(t("dota.team.joinSuccess"));
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
    if (!authSession?.accessToken || !canManageParty) {
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
  }, [authSession?.accessToken, canManageParty]);

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
      if (cancelled || !canManageParty) {
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
  }, [authSession?.accessToken, authSession?.userId, party.isMember, party.slug]);

  useEffect(() => {
    if (!canManageParty) {
      setApplications([]);
      setApplicationError(null);
    }
  }, [canManageParty]);

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

  useEffect(() => {
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

  const memberIds = new Set(party.members.map((member) => member.userId));
  const inviteCandidates = friends.filter((friend) => !memberIds.has(friend.id));
  const friendInviteQueryNormalized = friendInviteQuery.trim().toLowerCase();
  const filteredInviteCandidates = friendInviteQueryNormalized
    ? inviteCandidates.filter((friend) =>
        friend.displayName.toLowerCase().includes(friendInviteQueryNormalized)
      )
    : inviteCandidates;
  const claimedRoles = new Set(
    party.members
      .map((member) => member.positionRole)
      .filter((role): role is DotaPositionRole => Boolean(role))
  );
  const selectableRecruitRoles = ROLE_POSITIONS.filter((role) => !claimedRoles.has(role));
  const effectiveRecruitRoles = recruitRoles.filter((role) => selectableRecruitRoles.includes(role));
  const positionSlots = ROLE_POSITIONS.map((role) => ({
    apps: applications.filter((invite) => invite.positionRole === role),
    member: party.members.find((item) => item.positionRole === role) ?? null,
    recruiting: isRecruitLooking && effectiveRecruitRoles.includes(role),
    role
  }));
  const unassignedMembers = party.members.filter((member) => !member.positionRole);
  const openInviteRoles = ROLE_POSITIONS.filter((role) => !claimedRoles.has(role));
  const myMembership = authSession?.userId
    ? party.members.find((member) => member.userId === authSession.userId) ?? null
    : null;

  useEffect(() => {
    if (!isLocaleHydrated) {
      setExpiryLabel(null);
      return;
    }

    setExpiryLabel(formatExpiry(party.expiresAt, t, resolvedLocale));
  }, [isLocaleHydrated, party.expiresAt, resolvedLocale, t]);
  const kindLabel =
    party.kind === "PARTY" ? t("dota.team.kindParty") : t("dota.team.kindTeam");

  async function handleInvite(userId: string, positionRole: DotaPositionRole) {
    if (!authSession?.accessToken) {
      return;
    }

    setError(null);
    setPending(true);

    try {
      await inviteFriendToParty(party.slug, userId, authSession.accessToken, positionRole);
      const refreshed = await fetchGameParty(party.slug, authSession.accessToken);
      setParty(refreshed);
    } catch {
      setError(t("dota.team.inviteError"));
    } finally {
      setPending(false);
    }
  }

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

  async function handleLeave() {
    if (!authSession?.accessToken) {
      return;
    }

    const mustDisband = party.isOwner && party.members.length > 1;

    if (mustDisband) {
      const confirmed = window.confirm(
        t("games.community.disbandConfirm", { name: party.name })
      );

      if (!confirmed) {
        return;
      }
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
    if (!authSession?.accessToken || !canManageParty) {
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
    if (!authSession?.accessToken || !party.isOwner) {
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
    if (!authSession?.accessToken || !canManageParty) {
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

  async function handleAcceptApplication(invite: GamePartyInvite) {
    if (!authSession?.accessToken || !canManageParty) {
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
    if (!authSession?.accessToken || !canManageParty) {
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
    if (!authSession?.accessToken || party.isMember) {
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
      await stackWithPlayer(captainSlug, authSession.accessToken, undefined, role);
      setVisitorOpenRoles((current) => current.filter((item) => item !== role));
    } catch (applyError) {
      setVisitorApplyError(resolveStackInviteError(applyError, t));
    } finally {
      setVisitorApplyBusyRole(null);
    }
  }

  async function handleAcceptViewerInvite() {
    if (!authSession?.accessToken || !viewerInvite) {
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
    if (!authSession?.accessToken || !viewerInvite) {
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
    if (!authSession?.accessToken || !party.isMember) {
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
    if (!authSession?.accessToken || !party.isMember) {
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
        <div className={styles.rosterColumn}>
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
            {joinMessage ? <p className={styles.lead}>{joinMessage}</p> : null}
            {isRecruitLooking ? (
              <p className={styles.lead}>
                {effectiveRecruitRoles.length > 0
                  ? t("dota.team.lookingBannerRoles", {
                      roles: effectiveRecruitRoles
                        .map((role) => `${role} ${getDotaPositionLabel(role, t)}`)
                        .join(", ")
                    })
                  : t("dota.team.lookingBanner")}
              </p>
            ) : null}
            {canManageParty ? (
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
              {viewerInvite && !party.isMember ? (
                <>
                  <button
                    className="button-primary"
                    disabled={viewerInviteBusy}
                    onClick={() => void handleAcceptViewerInvite()}
                    type="button"
                  >
                    {viewerInviteBusy ? t("common.loadingEllipsis") : t("dota.team.acceptInvite")}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={viewerInviteBusy}
                    onClick={() => void handleDeclineViewerInvite()}
                    type="button"
                  >
                    {t("dota.team.declineInvite")}
                  </button>
                </>
              ) : (
                <button className="button-primary" onClick={() => void handleShare()} type="button">
                  {copied ? t("dota.team.copied") : t("dota.team.inviteCta")}
                </button>
              )}
              {authSession && party.isMember ? (
                <button
                  className="button-secondary"
                  disabled={pending}
                  onClick={() => void handleLeave()}
                  type="button"
                >
                  {party.isOwner && party.members.length > 1
                    ? t("games.community.disbandRoster")
                    : t("dota.team.leave")}
                </button>
              ) : null}
              {!authSession && joinTokenFromUrl ? (
                <Link className="button-secondary" href="/dota/create">
                  {t("games.search.createCta")}
                </Link>
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

          {(lookingError || applicationError) && canManageParty ? (
            <FormFeedback errorMessage={lookingError ?? applicationError} />
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
              {role} · {getDotaPositionLabel(role, t)}
            </span>
            {member ? (
              <>
                <strong>
                  {member.dotaSlug ? (
                    <Link href={`/dota/${member.dotaSlug}`}>{member.displayName}</Link>
                  ) : (
                    member.displayName
                  )}
                </strong>
                <span className={styles.slotMeta}>
                  {memberRoleLabel(member.role, t)}
                  {member.mmr ? ` · MMR ${member.mmr}` : ""}
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
                      className={styles.kickButton}
                      disabled={pending}
                      onClick={() => void handleClearSlot()}
                      type="button"
                    >
                      {t("dota.team.clearSlot")}
                    </button>
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
                    <strong>
                      {recruiting ? t("dota.team.slotLooking") : t("dota.team.openSlot")}
                    </strong>
                    <span className={styles.slotMeta}>
                      {recruiting
                        ? t("dota.team.slotLookingHint")
                        : t("dota.team.slotFindHint")}
                    </span>
                    <div className={styles.slotActions}>
                      <button
                        className={recruiting ? "button-secondary" : "button-primary"}
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
                      {party.isMember ? (
                        <button
                          className="button-secondary"
                          disabled={pending || lookingBusy}
                          onClick={() => void handleClaimSlot(role)}
                          type="button"
                        >
                          {t("dota.team.claimSlot")}
                        </button>
                      ) : null}
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
                    <strong>
                      {recruiting ? t("dota.team.slotLooking") : t("dota.team.openSlot")}
                    </strong>
                    <span className={styles.slotMeta}>
                      {recruiting
                        ? t("dota.team.slotLookingHint")
                        : t("dota.team.openSlotHint")}
                    </span>
                    <button
                      className="button-secondary"
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
                    <strong>
                      {viewerInvite?.positionRole === role
                        ? t("dota.team.invitedSlot")
                        : t("dota.team.openSlot")}
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
                        className="button-primary"
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
                        className="button-primary"
                        disabled={visitorApplyBusyRole === role || Boolean(viewerInvite)}
                        onClick={() => void handleVisitorApply(role)}
                        type="button"
                      >
                        {visitorApplyBusyRole === role
                          ? t("games.search.stackBusy")
                          : t("dota.team.applyForOpenRole", {
                              role: `${role} ${getDotaPositionLabel(role, t)}`
                            })}
                      </button>
                    ) : (
                      <Link className="button-secondary" href="/dota/create">
                        {t("games.search.createCta")}
                      </Link>
                    )}
                  </>
                ) : (
                  <>
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
        <FormFeedback errorMessage={visitorApplyError} />
      ) : null}

      {unassignedMembers.length > 0 ? (
        <section className={styles.invitePanel}>
          <h2>{t("dota.team.unassigned")}</h2>
          <ul className={styles.friendList}>
            {unassignedMembers.map((member) => (
              <li key={`unassigned-${member.userId}`}>
                <span className={styles.unassignedCopy}>
                  {member.dotaSlug ? (
                    <Link href={`/dota/${member.dotaSlug}`}>{member.displayName}</Link>
                  ) : (
                    member.displayName
                  )}
                  {member.role !== "MEMBER" ? ` · ${memberRoleLabel(member.role, t)}` : ""}
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
                </span>
                {canManageParty &&
                member.role !== "OWNER" &&
                (party.isOwner || member.role === "MEMBER") ? (
                  <button
                    className="button-secondary"
                    disabled={pending}
                    onClick={() => void handleKick(member.userId)}
                    type="button"
                  >
                    {t("dota.team.kick")}
                  </button>
                ) : null}
                {party.isOwner && member.role === "MEMBER" ? (
                  <button
                    className="button-secondary"
                    disabled={pending}
                    onClick={() => void handleToggleOfficer(member.userId, true)}
                    type="button"
                  >
                    {t("dota.team.makeOfficer")}
                  </button>
                ) : null}
                {party.isOwner && member.role === "OFFICER" ? (
                  <button
                    className="button-secondary"
                    disabled={pending}
                    onClick={() => void handleToggleOfficer(member.userId, false)}
                    type="button"
                  >
                    {t("dota.team.removeOfficer")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManageParty && party.openSlots > 0 ? (
        <section className={styles.invitePanel}>
          <div className={styles.invitePanelHead}>
            <h2>
              {t("dota.team.inviteFriendsTitle")}
              {inviteCandidates.length > 0 ? (
                <span className={styles.applicationCount}>{inviteCandidates.length}</span>
              ) : null}
            </h2>
            {inviteCandidates.length > 6 ? (
              <input
                className={styles.inviteSearch}
                onChange={(event) => setFriendInviteQuery(event.target.value)}
                placeholder={t("dota.team.inviteFriendsSearch")}
                type="search"
                value={friendInviteQuery}
              />
            ) : null}
          </div>
          {inviteCandidates.length === 0 ? (
            <div className={styles.inviteEmpty}>
              <p>{t("dota.team.noFriendsToInvite")}</p>
              <Link className="button-secondary" href="/dota#dota-account-id-search">
                {t("dota.team.addFriendCta")}
              </Link>
            </div>
          ) : filteredInviteCandidates.length === 0 ? (
            <p className={styles.inviteRoleHint}>{t("dota.team.inviteFriendsSearchEmpty")}</p>
          ) : (
            <>
              <p className={styles.inviteHint}>{t("dota.team.inviteFriendsHint")}</p>
              <ul className={styles.inviteFriendList}>
                {filteredInviteCandidates.map((friend) => (
                  <li className={styles.inviteFriendRow} key={friend.id}>
                    <span className={styles.inviteFriendName}>{friend.displayName}</span>
                    {openInviteRoles.length === 0 ? (
                      <span className={styles.inviteRoleHint}>{t("dota.team.inviteNoOpenRoles")}</span>
                    ) : (
                      <div
                        className={styles.inviteRoleRow}
                        role="group"
                        aria-label={t("dota.team.invitePickRole")}
                      >
                        {openInviteRoles.map((role) => (
                          <button
                            className={styles.inviteRoleChip}
                            disabled={pending}
                            key={`${friend.id}-${role}`}
                            onClick={() => void handleInvite(friend.id, role)}
                            title={t("dota.team.inviteToRole", {
                              role: `${role} ${getDotaPositionLabel(role, t)}`
                            })}
                            type="button"
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}
        </div>

        {party.isMember ? (
          <aside className={styles.chatPanel} aria-label={t("dota.team.chatTitle")}>
            <div className={styles.chatHead}>
              <h2>{t("dota.team.chatTitle")}</h2>
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
                maxLength={10000}
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
