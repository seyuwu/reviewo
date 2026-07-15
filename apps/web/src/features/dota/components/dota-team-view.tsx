"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  updatePartyMemberPosition
} from "../../social/api/social-api";
import {
  connectPartySocket,
  type PartySocketConnection,
  type PartySocketHandlersRef
} from "../../social/lib/party-socket";
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
const PARTY_POLL_MS = 5_000;
const ROLE_POSITIONS = ["1", "2", "3", "4", "5"] as const satisfies readonly DotaPositionRole[];

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
      isMember: current.isMember,
      isOwner: current.isOwner
    };
  }

  return {
    ...incoming,
    isMember: incoming.members.some((member) => member.userId === viewerUserId),
    isOwner: incoming.ownerUserId === viewerUserId
  };
}

export function DotaTeamView({ party: initialParty }: DotaTeamViewProps) {
  const t = useTranslation();
  const { isLocaleHydrated, resolvedLocale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [party, setParty] = useState(initialParty);
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
  const [renameDraft, setRenameDraft] = useState(initialParty.name);
  const [renaming, setRenaming] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [copiedDotaIdUserId, setCopiedDotaIdUserId] = useState<string | null>(null);
  const [friendInviteQuery, setFriendInviteQuery] = useState("");
  const joinHandledRef = useRef(false);
  const partySocketRef = useRef<PartySocketConnection | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const shouldStickChatToBottomRef = useRef(true);
  const pendingChatScrollToBottomRef = useRef(false);
  const joinTokenFromUrl = lookLikeJoinToken(searchParams.get("join"))
    ? searchParams.get("join")
    : null;

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
  }, [initialParty]);

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
      if (!party.isOwner) {
        setApplications([]);
      }
      return;
    }

    let cancelled = false;
    shouldStickChatToBottomRef.current = true;
    pendingChatScrollToBottomRef.current = true;

    const handlersRef: PartySocketHandlersRef = {
      current: {
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
            setParty((current) =>
              applyLivePartyUpdate(current, nextParty, authSession.userId)
            );
          }
        }
      }
    };

    let socketConnection: PartySocketConnection | null = connectPartySocket(
      party.slug,
      authSession.accessToken,
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
          party.isOwner ? fetchMyParties(authSession.accessToken) : Promise.resolve(null),
          party.isOwner ? fetchDotaLfg() : Promise.resolve(null)
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

        if (lfg && authSession.userId) {
          const hit = lfg.results.find(
            (player) =>
              player.ownerUserId === authSession.userId && player.partySlug === party.slug
          );

          if (hit) {
            setIsRecruitLooking(true);
            const openRoles = hit.recruitedRoles.filter((role): role is DotaPositionRole =>
              ROLE_POSITIONS.includes(role as DotaPositionRole)
            );
            setRecruitRoles(openRoles);
          } else {
            setIsRecruitLooking(false);
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
    const pollId = window.setInterval(() => {
      void refreshLiveState();
    }, PARTY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      if (partySocketRef.current === socketConnection) {
        partySocketRef.current = null;
      }
      socketConnection?.disconnect();
      socketConnection = null;
    };
  }, [authSession?.accessToken, authSession?.userId, party.isMember, party.isOwner, party.slug]);

  useEffect(() => {
    if (!party.isOwner) {
      setApplications([]);
      setApplicationError(null);
      setIsRecruitLooking(false);
      setLookingError(null);
      setHasDotaProfile(null);
    }
  }, [party.isOwner]);

  useEffect(() => {
    if (party.isMember) {
      setVisitorOpenRoles([]);
      setVisitorApplyError(null);
      return;
    }

    let cancelled = false;

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

    void loadVisitorRecruitRoles();
    const pollId = window.setInterval(() => {
      void loadVisitorRecruitRoles();
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [party.isMember, party.slug]);

  useEffect(() => {
    if (!authSession?.accessToken || !party.isOwner) {
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
  }, [authSession?.accessToken, party.isOwner]);

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
    if (!authSession?.accessToken || !party.isOwner) {
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

  async function syncRecruitLooking(nextRoles: DotaPositionRole[]) {
    if (!authSession?.accessToken) {
      return;
    }

    const roles = nextRoles.filter((role) => !claimedRoles.has(role));
    setRecruitRoles(roles);
    setLookingBusy(true);
    setLookingError(null);

    try {
      if (roles.length === 0) {
        if (isRecruitLooking) {
          await setDotaLfgLooking(false, authSession.accessToken);
        }
        setIsRecruitLooking(false);
        return;
      }

      if (hasDotaProfile === false) {
        setLookingError(t("dota.team.recruitNeedProfile"));
        return;
      }

      await setDotaLfgLooking(true, authSession.accessToken, {
        partySlug: party.slug,
        recruitedRoles: roles
      });
      setIsRecruitLooking(true);
      setHasDotaProfile(true);
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
    if (!party.isOwner || claimedRoles.has(role) || lookingBusy) {
      return;
    }

    const isRecruitingRole = isRecruitLooking && effectiveRecruitRoles.includes(role);
    const next = isRecruitingRole
      ? effectiveRecruitRoles.filter((item) => item !== role)
      : [...new Set([...effectiveRecruitRoles, role])].sort();

    await syncRecruitLooking(next);
  }

  async function handleAcceptApplication(invite: GamePartyInvite) {
    if (!authSession?.accessToken || !party.isOwner) {
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

      const myParties = await fetchMyParties(authSession.accessToken);
      setApplications(filterPartyApplications(myParties.outgoingInvites ?? [], party.slug));
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
    if (!authSession?.accessToken || !party.isOwner) {
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

  async function handleClaimSlot(role: DotaPositionRole) {
    if (!authSession?.accessToken || !party.isMember) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const updated = await updatePartyMemberPosition(party.slug, role, authSession.accessToken);
      setParty(updated);
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
      setParty(updated);
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
          </header>

          {(lookingError || applicationError) && party.isOwner ? (
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
                  {member.role === "OWNER" ? t("dota.team.roleOwner") : t("dota.team.roleMember")}
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
                  {party.isOwner && member.role !== "OWNER" ? (
                    <button
                      className={styles.kickButton}
                      disabled={pending}
                      onClick={() => void handleKick(member.userId)}
                      type="button"
                    >
                      {t("dota.team.kick")}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {party.isOwner ? (
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
                        disabled={lookingBusy || hasDotaProfile === false}
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
                    {hasDotaProfile === false ? (
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
                    <strong>{t("dota.team.openSlot")}</strong>
                    <span className={styles.slotMeta}>{t("dota.team.openSlotHint")}</span>
                    <button
                      className="button-secondary"
                      disabled={pending}
                      onClick={() => void handleClaimSlot(role)}
                      type="button"
                    >
                      {t("dota.team.claimSlot")}
                    </button>
                  </>
                ) : visitorOpenRoles.includes(role) ? (
                  <>
                    <strong>{t("dota.team.openSlot")}</strong>
                    <span className={styles.slotMeta}>
                      {t("games.search.recruitCardRoles", {
                        roles: `${role} ${getDotaPositionLabel(role, t)}`
                      })}
                    </span>
                    {authSession ? (
                      <button
                        className="button-primary"
                        disabled={visitorApplyBusyRole === role}
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
                  {member.role === "OWNER" ? ` · ${t("dota.team.roleOwner")}` : ""}
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
                {party.isOwner && member.role !== "OWNER" ? (
                  <button
                    className="button-secondary"
                    disabled={pending}
                    onClick={() => void handleKick(member.userId)}
                    type="button"
                  >
                    {t("dota.team.kick")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {party.isOwner && party.openSlots > 0 ? (
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
