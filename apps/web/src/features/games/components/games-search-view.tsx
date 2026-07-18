"use client";

import { type DotaGreenFlagKey, type DotaRedFlagKey } from "@reviewo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getOrCreateVisitorId } from "../../../lib/site-presence";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  fetchDiscoveryStats,
  pingSitePresence
} from "../../discovery/api/discovery-api";
import {
  fetchDotaLfg,
  fetchMyDotaProfile,
  setDotaLfgLooking,
  type DotaLfgHit
} from "../../dota/api/dota-api";
import { useMyDotaProfileNav } from "../../dota/hooks/use-my-dota-profile-nav";
import {
  formatDotaMmr,
  getDotaGreenFlagLabel,
  getDotaPositionLabel,
  getDotaRedFlagLabel,
  parseDotaMmrRange
} from "../../dota/lib/labels";
import { useTranslation } from "../../i18n/locale-provider";
import { trackAnalyticsCta } from "../../analytics/components/product-analytics-listener";
import {
  acceptPartyInvite,
  createGameParty,
  declinePartyInvite,
  disbandGameParty,
  fetchMyParties,
  stackWithPlayer
} from "../../social/api/social-api";
import { PARTY_NOTIFICATION_EVENT } from "../../social/lib/party-notifications-socket";
import type { DotaPositionRole, GameParty, GamePartyInvite } from "../../social/types/social";
import { resolveInviteDecisionError, resolveStackInviteError } from "../lib/resolve-stack-invite-error";
import {
  gamesSearchCoachSeenKey,
  GamesSearchOnboarding
} from "./games-search-onboarding";
import { GamesSearchCinematic } from "./games-search-cinematic";
import type {
  GamesSearchCinematicResult,
  GamesSearchCinematicVisualPhase
} from "./games-search-cinematic-types";
import type { IntentMode } from "./games-search-onboarding-types";
import { useGamesLaunchStatus } from "../hooks/use-games-launch-status";
import styles from "./games-search-view.module.css";
import { GamesSearchTipRotator } from "./games-search-tip-rotator";
import { GamesSearchWaitlistView } from "./games-search-waitlist-view";

const PENDING_STACK_KEY = "opinia.pendingStackSlug";
const RECOMMENDATION_COUNT = 3;
const REFRESH_MS = 15_000;
/** Fallback when party_notification socket misses an event. */
const INVITE_POLL_MS = 15_000;
const OUTGOING_FLASH_MS = 3_500;
const ONLINE_POLL_MS = 45_000;
const ROLE_POSITIONS = ["1", "2", "3", "4", "5"] as const satisfies readonly DotaPositionRole[];

function mmrMidpoint(mmr: string | null): number | null {
  const { from, to } = parseDotaMmrRange(mmr);
  const low = Number(from);
  const high = Number(to || from);

  if (!Number.isFinite(low)) {
    return null;
  }

  if (!Number.isFinite(high)) {
    return low;
  }

  return (low + high) / 2;
}

function rankByMmr(players: DotaLfgHit[], myMmr: string | null): DotaLfgHit[] {
  const myMid = mmrMidpoint(myMmr);

  return [...players].sort((left, right) => {
    const leftMid = mmrMidpoint(left.mmr);
    const rightMid = mmrMidpoint(right.mmr);

    if (myMid === null) {
      return left.title.localeCompare(right.title);
    }

    const leftDistance =
      leftMid === null ? Number.POSITIVE_INFINITY : Math.abs(leftMid - myMid);
    const rightDistance =
      rightMid === null ? Number.POSITIVE_INFINITY : Math.abs(rightMid - myMid);

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.title.localeCompare(right.title);
  });
}

function playerInitial(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function outgoingInviteClass(
  status: GamePartyInvite["status"],
  stylesMap: typeof styles
): string {
  if (status === "ACCEPTED") {
    return stylesMap.inviteAccepted ?? "";
  }

  if (status === "DECLINED" || status === "CANCELLED") {
    return stylesMap.inviteDeclined ?? "";
  }

  return stylesMap.invitePending ?? "";
}

function mergeOutgoingInvites(
  current: GamePartyInvite[],
  incoming: GamePartyInvite[]
): GamePartyInvite[] {
  const byId = new Map<string, GamePartyInvite>();

  for (const invite of current) {
    byId.set(invite.id, invite);
  }

  for (const invite of incoming) {
    byId.set(invite.id, {
      ...invite,
      direction: invite.direction ?? "outgoing"
    });
  }

  const serverIds = new Set(incoming.map((invite) => invite.id));

  return [...byId.values()]
    .filter((invite) => {
      if (serverIds.has(invite.id)) {
        return true;
      }

      // Keep optimistic PENDING invites briefly until the server catches up.
      return invite.status === "PENDING" && invite.direction !== "incoming";
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function GamesSearchView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const myDotaProfile = useMyDotaProfileNav();
  const { status: launchStatus, isLoading: isLaunchStatusLoading } = useGamesLaunchStatus();
  const searchLive = launchStatus.searchLive;
  const [results, setResults] = useState<DotaLfgHit[]>([]);
  const [myMmr, setMyMmr] = useState<string | null>(null);
  const [myRoles, setMyRoles] = useState<DotaPositionRole[]>([]);
  const [ownedParties, setOwnedParties] = useState<GameParty[]>([]);
  const [invites, setInvites] = useState<GamePartyInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<GamePartyInvite[]>([]);
  const [dismissedOutgoingIds, setDismissedOutgoingIds] = useState<Set<string>>(() => new Set());
  const flashScheduledRef = useRef(new Set<string>());
  const [selectedPartySlug, setSelectedPartySlug] = useState("");
  const [intentMode, setIntentMode] = useState<IntentMode>("join");
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [lookingBusy, setLookingBusy] = useState(false);
  const [gateSlug, setGateSlug] = useState<string | null>(null);
  const [stackBusySlug, setStackBusySlug] = useState<string | null>(null);
  const [stackMessage, setStackMessage] = useState<string | null>(null);
  const [stackError, setStackError] = useState<string | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [invitePickerSlug, setInvitePickerSlug] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [cinematicMode, setCinematicMode] = useState<"checking" | "active" | "done">("checking");
  const [cinematicProfileReady, setCinematicProfileReady] = useState(false);
  const [cinematicSearchPending, setCinematicSearchPending] = useState(false);
  const [cinematicVisualPhase, setCinematicVisualPhase] =
    useState<GamesSearchCinematicVisualPhase>("hidden");
  const controlsRef = useRef<HTMLElement | null>(null);
  const intentCoachRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);

  const refreshList = useCallback(
    async (options?: { advanceBatch?: boolean; quiet?: boolean }) => {
      if (!options?.quiet) {
        setIsLoading(true);
      }

      setLoadError(null);

      try {
        const response = await fetchDotaLfg();
        setResults(response.results);

        if (options?.advanceBatch) {
          // After a fresh fetch, move to the next trio so refresh doesn't re-show the same cards.
          setBatchIndex((current) => current + 1);
        } else if (!options?.quiet) {
          setBatchIndex(0);
        }
      } catch {
        setLoadError(t("games.search.loadError"));

        if (!options?.quiet) {
          setResults([]);
        }
      } finally {
        if (!options?.quiet) {
          setIsLoading(false);
        }

        setHasLoadedOnce(true);
      }
    },
    [t]
  );

  const refreshParties = useCallback(async () => {
    if (!authSession?.accessToken || !myDotaProfile.hasProfile) {
      setMyMmr(null);
      setMyRoles([]);
      setOwnedParties([]);
      setInvites([]);
      setOutgoingInvites([]);
      setSelectedPartySlug("");
      return;
    }

    try {
      const parties = await fetchMyParties(authSession.accessToken);
      const owned = [
        parties.team,
        ...(parties.parties?.length ? parties.parties : parties.party ? [parties.party] : [])
      ].filter((party): party is GameParty => Boolean(party?.canManageParty ?? party?.isOwner));
      setOwnedParties(owned);
      setInvites(parties.invites.filter((invite) => invite.status === "PENDING"));
      setOutgoingInvites((current) =>
        mergeOutgoingInvites(current, parties.outgoingInvites ?? [])
      );

      try {
        const profile = await fetchMyDotaProfile(authSession.accessToken);
        setMyMmr(profile.mmr);
        setMyRoles(profile.roles as DotaPositionRole[]);
      } catch {
        // Keep party/invite state even if profile refresh fails.
      }
    } catch {
      // Keep previous invites on transient /social/parties/me failures.
    }
  }, [authSession?.accessToken, myDotaProfile.hasProfile]);

  useEffect(() => {
    if (!searchLive) {
      setResults([]);
      setIsLoading(false);
      setHasLoadedOnce(true);
      return;
    }

    void refreshList();
  }, [refreshList, searchLive]);

  useEffect(() => {
    if (!searchLive) {
      setMyMmr(null);
      setMyRoles([]);
      setOwnedParties([]);
      setInvites([]);
      setOutgoingInvites([]);
      setSelectedPartySlug("");
      return;
    }

    void refreshParties();
  }, [refreshParties, searchLive]);

  useEffect(() => {
    if (!searchLive || !isAuthSessionLoaded || myDotaProfile.isLoading) {
      return;
    }

    setCinematicMode((current) => {
      if (current !== "checking") {
        return current;
      }

      return myDotaProfile.hasProfile ? "done" : "active";
    });
  }, [
    isAuthSessionLoaded,
    myDotaProfile.hasProfile,
    myDotaProfile.isLoading,
    searchLive
  ]);

  useEffect(() => {
    if (
      !searchLive ||
      !isAuthSessionLoaded ||
      !authSession?.userId ||
      !myDotaProfile.hasProfile ||
      cinematicMode !== "done"
    ) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const seenKey = gamesSearchCoachSeenKey(authSession.userId);
    if (window.localStorage.getItem(seenKey) === "1") {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (!intentCoachRef.current) {
        return;
      }

      setCoachOpen(true);
    }, cinematicProfileReady ? 1800 : 700);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    authSession?.userId,
    cinematicMode,
    cinematicProfileReady,
    isAuthSessionLoaded,
    myDotaProfile.hasProfile,
    searchLive
  ]);

  function markCoachSeen() {
    if (authSession?.userId && typeof window !== "undefined") {
      window.localStorage.setItem(gamesSearchCoachSeenKey(authSession.userId), "1");
    }
  }

  function closeCoach() {
    markCoachSeen();
    setCoachOpen(false);
  }

  useEffect(() => {
    if (!searchLive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshList({ quiet: true });
    }, REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshList, searchLive]);

  useEffect(() => {
    if (!searchLive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshParties();
    }, INVITE_POLL_MS);

    function handlePartyNotification(event: Event) {
      const detail = (event as CustomEvent<{ invite?: GamePartyInvite; type?: string }>).detail;
      const invite = detail?.invite;
      const type = detail?.type;

      if (!invite?.id || !type) {
        void refreshParties();
        return;
      }

      // Instant UI from socket payload; confirm with API in background.
      if (type === "invite_received" && invite.status === "PENDING") {
        setInvites((current) => {
          if (current.some((item) => item.id === invite.id)) {
            return current;
          }

          return [{ ...invite, direction: "incoming" }, ...current];
        });
      }

      if (type === "application_received" && invite.status === "PENDING") {
        setOutgoingInvites((current) => {
          if (current.some((item) => item.id === invite.id)) {
            return current;
          }

          return [
            {
              ...invite,
              direction: "outgoing",
              inviteKind: invite.inviteKind ?? "APPLICATION"
            },
            ...current
          ];
        });
      }

      if (type === "declined" || type === "accepted" || type === "member_joined") {
        setInvites((current) => current.filter((item) => item.id !== invite.id));
        setOutgoingInvites((current) => current.filter((item) => item.id !== invite.id));
      }

      void refreshParties();
    }

    window.addEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
    };
  }, [refreshParties, searchLive]);

  useEffect(() => {
    if (!searchLive) {
      return;
    }

    let cancelled = false;

    async function loadOnline() {
      try {
        const visitorId = getOrCreateVisitorId();
        const heartbeat = visitorId ? await pingSitePresence(visitorId) : null;
        const stats = await fetchDiscoveryStats();

        if (!cancelled) {
          setOnlineNow(Math.max(stats.onlineNow, heartbeat?.onlineNow ?? 0));
        }
      } catch {
        // Keep previous value on transient failures.
      }
    }

    void loadOnline();
    const intervalId = window.setInterval(() => {
      void loadOnline();
    }, ONLINE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [searchLive]);

  useEffect(() => {
    for (const invite of outgoingInvites) {
      if (invite.status === "PENDING" || flashScheduledRef.current.has(invite.id)) {
        continue;
      }

      flashScheduledRef.current.add(invite.id);
      window.setTimeout(() => {
        setDismissedOutgoingIds((current) => {
          const next = new Set(current);
          next.add(invite.id);
          return next;
        });
      }, OUTGOING_FLASH_MS);
    }
  }, [outgoingInvites]);

  const myLfgHit = useMemo(() => {
    if (myDotaProfile.slug) {
      const byProfile = results.find((player) => player.slug === myDotaProfile.slug);
      if (byProfile) {
        return byProfile;
      }
    }

    // Sub-captains recruit on the captain's LFG card — match by managed party slug.
    const managedSlugs = new Set(ownedParties.map((party) => party.slug));
    return results.find((player) => player.partySlug && managedSlugs.has(player.partySlug)) ?? null;
  }, [myDotaProfile.slug, ownedParties, results]);

  useEffect(() => {
    if (cinematicSearchPending) {
      setIsLooking(true);

      if (myLfgHit) {
        setCinematicSearchPending(false);
      }

      return;
    }

    if (!myDotaProfile.slug && ownedParties.length === 0) {
      setIsLooking(false);
      return;
    }

    setIsLooking(Boolean(myLfgHit));
  }, [cinematicSearchPending, myDotaProfile.slug, myLfgHit, ownedParties.length]);

  useEffect(() => {
    if (!isLooking || !myLfgHit) {
      return;
    }

    setIntentMode(myLfgHit.partySlug ? "recruit" : "join");
  }, [isLooking, myLfgHit]);

  useEffect(() => {
    if (intentMode === "join") {
      setSelectedPartySlug("");
    }
  }, [intentMode]);

  useEffect(() => {
    if (!selectedPartySlug) {
      return;
    }

    if (!ownedParties.some((party) => party.slug === selectedPartySlug)) {
      setSelectedPartySlug("");
    }
  }, [ownedParties, selectedPartySlug]);

  useEffect(() => {
    if (!isAuthSessionLoaded || !authSession?.accessToken || !myDotaProfile.slug) {
      return;
    }

    const pendingSlug =
      typeof window !== "undefined" ? window.sessionStorage.getItem(PENDING_STACK_KEY) : null;

    if (!pendingSlug) {
      return;
    }

    window.sessionStorage.removeItem(PENDING_STACK_KEY);
    void handleStack(pendingSlug);
    // Intentionally once after profile becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.accessToken, isAuthSessionLoaded, myDotaProfile.slug]);

  /** While looking: recruit → show inviteable solos; join → show recruiting parties. Idle → both. */
  const feedMode = useMemo((): "all" | "players" | "parties" => {
    if (!isLooking) {
      return "all";
    }

    if (myLfgHit?.partySlug || intentMode === "recruit") {
      return "players";
    }

    return "parties";
  }, [intentMode, isLooking, myLfgHit?.partySlug]);

  const candidates = useMemo(() => {
    const others = results.filter((player) => player.ownerUserId !== authSession?.userId);
    const filtered =
      feedMode === "players"
        ? others.filter((player) => !player.partySlug)
        : feedMode === "parties"
          ? others.filter((player) => Boolean(player.partySlug))
          : others;

    return rankByMmr(filtered, myMmr);
  }, [authSession?.userId, feedMode, myMmr, results]);

  useEffect(() => {
    setBatchIndex(0);
  }, [feedMode]);

  const totalBatches = Math.max(1, Math.ceil(candidates.length / RECOMMENDATION_COUNT));
  const activeBatch = candidates.length === 0 ? 0 : batchIndex % totalBatches;

  const visiblePlayers = useMemo(() => {
    const start = activeBatch * RECOMMENDATION_COUNT;
    return candidates.slice(start, start + RECOMMENDATION_COUNT);
  }, [activeBatch, candidates]);

  const canFindOthers = candidates.length > RECOMMENDATION_COUNT;
  const lookingCount = candidates.length;
  const visibleOutgoing = outgoingInvites.filter(
    (invite) => invite.status === "PENDING" || !dismissedOutgoingIds.has(invite.id)
  );

  async function handleIntentAction(nextMode: IntentMode) {
    if (lookingBusy || (isLooking && intentMode !== nextMode)) {
      return;
    }

    closeCoach();

    if (!isLooking) {
      setIntentMode(nextMode);
      setSelectedPartySlug("");
    }

    await handleToggleLooking(nextMode);
  }

  async function handleToggleLooking(requestedMode: IntentMode = intentMode) {
    if (!authSession?.accessToken || !myDotaProfile.hasProfile) {
      setGateSlug("__looking__");
      return;
    }

    setLookingBusy(true);
    setStackError(null);
    let createdRecruitPartySlug: string | null = null;

    try {
      const nextLooking = !isLooking;

      if (!nextLooking) {
        const stopPartySlug =
          requestedMode === "recruit"
            ? selectedPartySlug || myLfgHit?.partySlug || undefined
            : myLfgHit?.partySlug || undefined;

        await setDotaLfgLooking(
          false,
          authSession.accessToken,
          stopPartySlug ? { partySlug: stopPartySlug } : undefined
        );
        setIsLooking(false);
        if (requestedMode === "recruit") {
          setSelectedPartySlug("");
        }
        void trackAnalyticsCta("games_search_stop");
        await refreshList({ quiet: true });
        return;
      }

      if (requestedMode === "recruit") {
        const party = await createGameParty("PARTY", authSession.accessToken);
        const partySlug = party.slug;
        createdRecruitPartySlug = partySlug;
        setSelectedPartySlug(partySlug);
        setOwnedParties((current) =>
          current.some((item) => item.id === party.id) ? current : [party, ...current]
        );
        await refreshParties();
        void trackAnalyticsCta("games_party_create_from_search");

        if (party.openSlots <= 0) {
          try {
            await disbandGameParty(partySlug, authSession.accessToken);
          } catch {
            // Best-effort cleanup of unusable roster.
          }
          setSelectedPartySlug("");
          setOwnedParties((current) => current.filter((item) => item.slug !== partySlug));
          createdRecruitPartySlug = null;
          setStackError(t("games.search.partyFull"));
          return;
        }

        try {
          await setDotaLfgLooking(true, authSession.accessToken, {
            partySlug,
            recruitedRoles: [...ROLE_POSITIONS]
          });
        } catch (lookingError) {
          try {
            await disbandGameParty(partySlug, authSession.accessToken);
          } catch {
            // Best-effort cleanup if recruit LFG failed after create.
          }
          setSelectedPartySlug("");
          setOwnedParties((current) => current.filter((item) => item.slug !== partySlug));
          createdRecruitPartySlug = null;
          throw lookingError;
        }

        void trackAnalyticsCta("games_search_start_recruit");
      } else {
        await setDotaLfgLooking(true, authSession.accessToken);
        void trackAnalyticsCta("games_search_start_join");
      }

      setIsLooking(true);
      if (createdRecruitPartySlug) {
        router.push(`/dota/teams/${createdRecruitPartySlug}`);
        return;
      }
      await refreshList({ quiet: true });
    } catch (error) {
      setStackError(resolveStackInviteError(error, t));
    } finally {
      setLookingBusy(false);
    }
  }

  useEffect(() => {
    if (!invitePickerSlug) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Element | null;

      if (!target?.closest(`[data-invite-picker="${invitePickerSlug}"]`)) {
        setInvitePickerSlug(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setInvitePickerSlug(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [invitePickerSlug]);

  async function handleStack(
    targetSlug: string,
    positionRole?: DotaPositionRole,
    invitePartySlug?: string
  ) {
    setStackError(null);
    setStackMessage(null);

    if (!authSession?.accessToken || !myDotaProfile.hasProfile) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(PENDING_STACK_KEY, targetSlug);
      }
      setGateSlug(targetSlug);
      return;
    }

    const partySlugForInvite =
      invitePartySlug !== undefined ? invitePartySlug : selectedPartySlug || undefined;

    setStackBusySlug(positionRole ? `${targetSlug}:${positionRole}` : targetSlug);
    setInvitePickerSlug(null);

    try {
      const stacked = await stackWithPlayer(
        targetSlug,
        authSession.accessToken,
        partySlugForInvite || undefined,
        positionRole
      );

      if (stacked.invite.direction === "incoming") {
        setStackMessage(
          stacked.invite.inviteKind === "APPLICATION"
            ? t("games.search.applicationSent")
            : t("games.search.stackSent")
        );
        setInvites((current) => {
          const nextInvite: GamePartyInvite = {
            ...stacked.invite,
            direction: "incoming"
          };
          return [nextInvite, ...current.filter((item) => item.id !== nextInvite.id)];
        });
      } else {
        setStackMessage(t("games.search.stackSent"));
        setOutgoingInvites((current) => {
          const nextInvite: GamePartyInvite = {
            ...stacked.invite,
            direction: stacked.invite.direction ?? "outgoing"
          };
          return [nextInvite, ...current.filter((item) => item.id !== nextInvite.id)];
        });
        setDismissedOutgoingIds((current) => {
          const next = new Set(current);
          next.delete(stacked.invite.id);
          return next;
        });
        flashScheduledRef.current.delete(stacked.invite.id);
      }
      // Don't block the CTA on a full LFG/parties refresh.
      void Promise.all([refreshList({ quiet: true }), refreshParties()]);
    } catch (error) {
      setStackError(resolveStackInviteError(error, t));
    } finally {
      setStackBusySlug(null);
    }
  }

  async function handleAcceptInvite(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setInviteBusyId(invite.id);
    setStackError(null);

    try {
      const joined = await acceptPartyInvite(invite.id, authSession.accessToken);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setOutgoingInvites((current) => current.filter((item) => item.id !== invite.id));
      // Invitee → team page; captain accepting an application stays on search.
      if (invite.inviteKind !== "APPLICATION") {
        router.push(`/dota/teams/${joined.slug}`);
      }
    } catch (error) {
      setStackError(resolveInviteDecisionError(error, t));
      await refreshParties();
    } finally {
      setInviteBusyId(null);
    }
  }

  async function handleDeclineInvite(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setInviteBusyId(invite.id);
    setStackError(null);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setOutgoingInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch (error) {
      setStackError(resolveInviteDecisionError(error, t));
      await refreshParties();
    } finally {
      setInviteBusyId(null);
    }
  }

  function handleCinematicPrepared(result: GamesSearchCinematicResult) {
    setCinematicProfileReady(true);
    setCinematicSearchPending(true);
    setIntentMode(result.intentMode);
    setMyMmr(result.mmr);
    setMyRoles(result.roles);
    setIsLooking(true);

    if (result.party) {
      setSelectedPartySlug(result.party.slug);
      setOwnedParties((current) =>
        current.some((party) => party.id === result.party?.id)
          ? current
          : [result.party!, ...current]
      );
    }

    void refreshList({ quiet: true });
  }

  function handleCinematicComplete(result: GamesSearchCinematicResult) {
    setCoachOpen(false);
    setCinematicVisualPhase("rail");
    setCinematicMode("done");
    setCinematicProfileReady(true);
    setIntentMode(result.intentMode);
    if (result.intentMode === "recruit" && result.party) {
      router.push(`/dota/teams/${result.party.slug}`);
      return;
    }
    void Promise.all([refreshList({ quiet: true }), refreshParties()]);
  }

  const createHref =
    gateSlug && gateSlug !== "__looking__"
      ? `/dota/create?intent=stack&target=${encodeURIComponent(gateSlug)}`
      : "/dota/create?intent=search";
  const hasSearchProfile = myDotaProfile.hasProfile || cinematicProfileReady;

  if (isLaunchStatusLoading) {
    return (
      <section className={styles.page}>
        <p className="muted-copy">{t("common.loadingEllipsis")}</p>
      </section>
    );
  }

  if (!searchLive) {
    return <GamesSearchWaitlistView />;
  }

  return (
    <section className={styles.page}>
      <header
        className={`${styles.header}${
          cinematicMode !== "done" || cinematicProfileReady
            ? ` ${styles.headerCinematicHidden}`
            : ""
        }`}
      >
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>{t("games.search.pageTitle")}</h1>
          <p className={styles.lead}>{t("games.search.pageLead")}</p>
        </div>
        <GamesSearchTipRotator />
      </header>

      <div
        className={`${styles.searchStage}${
          cinematicMode !== "done" ? ` ${styles.searchStageCinematic}` : ""
        }`}
      >
        <div
          aria-hidden={cinematicMode !== "done"}
          className={`${styles.layout}${
            cinematicMode !== "done" ? ` ${styles.layoutCinematic}` : ""
          }${
            cinematicVisualPhase !== "hidden" ? ` ${styles.layoutShowLeft}` : ""
          }${
            cinematicVisualPhase === "feed" || cinematicVisualPhase === "rail"
              ? ` ${styles.layoutShowFeed}`
              : ""
          }${cinematicVisualPhase === "rail" ? ` ${styles.layoutShowRail}` : ""}`}
          inert={cinematicMode !== "done" ? true : undefined}
        >
        <aside
          className={styles.sidebar}
          ref={(node) => {
            controlsRef.current = node;
          }}
        >
          {!hasSearchProfile ? (
            <section className={`${styles.panel} ${styles.promoPanel}`}>
              <p className={styles.promoTitle}>{t("games.search.promoTitle")}</p>
              <p className={styles.promoLead}>{t("games.search.promoLead")}</p>
              <Link className="button-primary" href="/dota/create?intent=search">
                {t("games.search.createCta")}
              </Link>
            </section>
          ) : (
            <section className={styles.panel} data-cinematic-left-target>
              <div className={styles.searchProfileSummary}>
                <div className={styles.searchProfileMmr} data-cinematic-target="mmr">
                  <span>MMR</span>
                  <strong>{formatDotaMmr(myMmr)}</strong>
                </div>
                <div
                  aria-label={t("games.search.cinematic.yourRoles")}
                  className={styles.searchProfileRoles}
                >
                  {myRoles.map((role) => (
                    <span data-cinematic-target={`role-${role}`} key={`my-role-${role}`}>
                      {t("games.search.cinematic.positionShort", { role })}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.controlDivider} />
              <div className={styles.controlBlock} ref={intentCoachRef}>
                <h2 className={styles.panelTitle}>{t("games.search.intentTitle")}</h2>
                <div className={styles.modeList} aria-label={t("games.search.intentTitle")}>
                  <button
                    aria-pressed={isLooking && intentMode === "join"}
                    className={`${styles.modeCard}${
                      isLooking && intentMode === "join" ? ` ${styles.modeCardActive}` : ""
                    }`}
                    disabled={lookingBusy || (isLooking && intentMode !== "join")}
                    onClick={() => void handleIntentAction("join")}
                    type="button"
                  >
                    <strong>{t("games.search.intentLooking")}</strong>
                    <span>
                      {lookingBusy && intentMode === "join"
                        ? t("games.search.toggleLookingBusy")
                        : isLooking && intentMode === "join"
                          ? t("games.search.stopLooking")
                          : t("games.search.intentLookingHint")}
                    </span>
                  </button>
                  <button
                    aria-pressed={isLooking && intentMode === "recruit"}
                    className={`${styles.modeCard}${
                      isLooking && intentMode === "recruit" ? ` ${styles.modeCardActive}` : ""
                    }`}
                    disabled={lookingBusy || (isLooking && intentMode !== "recruit")}
                    onClick={() => void handleIntentAction("recruit")}
                    type="button"
                  >
                    <strong>{t("games.search.intentInvite")}</strong>
                    <span>
                      {lookingBusy && intentMode === "recruit"
                        ? t("games.search.toggleLookingBusy")
                        : isLooking && intentMode === "recruit"
                          ? t("games.search.stopRecruitLooking")
                          : t("games.search.intentInviteHint")}
                    </span>
                  </button>
                </div>
              </div>

              <Link className={styles.profileLink} href={myDotaProfile.href}>
                {t("games.search.openProfileCta")}
              </Link>
            </section>
          )}
        </aside>

        <div className={styles.main} ref={feedRef}>
          <div className={styles.statusBar}>
            <div className={styles.statsRow}>
              <p className={styles.statusText}>
                {t("games.search.lookingCount", { count: lookingCount })}
              </p>
              <p className={styles.statusText}>
                {t("games.search.onlineCount", {
                  count: onlineNow === null ? "—" : String(onlineNow)
                })}
              </p>
              <p className={styles.refreshNote}>
                {feedMode === "players"
                  ? t("games.search.feedHintPlayers")
                  : feedMode === "parties"
                    ? t("games.search.feedHintParties")
                    : t("games.search.feedHintAll")}
              </p>
            </div>
            <div className={styles.statusActions}>
              {canFindOthers ? (
                <button
                  className="button-secondary"
                  onClick={() => setBatchIndex((current) => current + 1)}
                  type="button"
                >
                  {t("games.search.findOthers")}
                </button>
              ) : null}
              <button
                className="button-secondary"
                disabled={isLoading}
                onClick={() => void refreshList({ advanceBatch: true })}
                type="button"
              >
                {isLoading ? t("common.loadingEllipsis") : t("games.search.refresh")}
              </button>
            </div>
          </div>

          {loadError ? <p className={styles.error}>{loadError}</p> : null}
          {stackError ? <p className={styles.error}>{stackError}</p> : null}
          {stackMessage ? <p className={styles.feedback}>{stackMessage}</p> : null}

          {isLoading && !hasLoadedOnce ? (
            <p className={styles.feedback}>{t("common.loadingEllipsis")}</p>
          ) : visiblePlayers.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} aria-hidden="true">
                ⌕
              </div>
              <h2 className={styles.emptyTitle}>
                {feedMode === "players"
                  ? t("games.search.emptyTitlePlayers")
                  : feedMode === "parties"
                    ? t("games.search.emptyTitleParties")
                    : t("games.search.emptyTitle")}
              </h2>
              <p className={styles.emptyLead}>
                {feedMode === "players"
                  ? t("games.search.emptyLeadPlayers")
                  : feedMode === "parties"
                    ? t("games.search.emptyLeadParties")
                    : t("games.search.emptyLead")}
              </p>
              {!isLooking ? (
                <button
                  className={`button-primary ${styles.emptyCta}`}
                  disabled={lookingBusy}
                  onClick={() => void handleIntentAction("join")}
                  type="button"
                >
                  {lookingBusy
                    ? t("games.search.toggleLookingBusy")
                    : t("games.search.startLooking")}
                </button>
              ) : (
                <p className={styles.waitingInviteText}>{t("games.search.invitesWaiting")}</p>
              )}
            </div>
          ) : (
            <ul className={styles.list}>
              {visiblePlayers.map((player) => {
                const isRecruitParty = Boolean(player.partySlug && player.partyName);
                const claimedRoles = new Set(player.claimedRoles ?? []);
                const lookingRoles = new Set(player.recruitedRoles ?? []);
                const rosterTitle = player.partyName ?? player.title;
                const rosterHref = player.partySlug
                  ? `/dota/teams/${player.partySlug}`
                  : `/dota/${player.slug}`;

                return (
                <li
                  className={`${styles.card}${
                    invitePickerSlug === player.slug ? ` ${styles.cardInviteOpen}` : ""
                  }`}
                  key={player.slug}
                >
                  <div className={styles.cardTop}>
                    <Link
                      aria-label={t("games.search.openRoster")}
                      className={styles.avatarLink}
                      href={rosterHref}
                    >
                      <span aria-hidden="true" className={styles.avatar}>
                        {playerInitial(rosterTitle)}
                      </span>
                    </Link>
                    <div className={styles.cardIdentity}>
                      <Link className={styles.cardTitle} href={rosterHref}>
                        {isRecruitParty
                          ? t("games.search.recruitCardSlots", {
                              current: String(player.memberCount ?? 1),
                              desired: String(player.desiredSize ?? player.memberCount ?? 1),
                              name: player.partyName ?? player.title
                            })
                          : player.title}
                      </Link>
                      <p className={styles.cardMmr}>
                        {isRecruitParty
                          ? t("games.search.recruitCardAvgMmr", {
                              mmr: formatDotaMmr(player.mmr)
                            })
                          : `${formatDotaMmr(player.mmr)} MMR`}
                      </p>
                      {isRecruitParty ? (
                        <p className={styles.recruitCaptain}>
                          {t("games.search.recruitCardCaptain", { name: player.title })}
                        </p>
                      ) : null}
                    </div>
                    <span className={styles.badge}>
                      {isRecruitParty
                        ? t("games.search.recruitCardBadge")
                        : t("games.search.lookingBadge")}
                    </span>
                  </div>
                  {isRecruitParty && (player.recruitedRoles?.length ?? 0) > 0 ? (
                    <p className={styles.recruitRoles}>
                      {t("games.search.recruitCardRoles", {
                        roles: player.recruitedRoles
                          .map((role) => `${role} ${getDotaPositionLabel(role, t)}`)
                          .join(" · ")
                      })}
                    </p>
                  ) : null}
                  <div className={styles.cardMeta}>
                    <div className={styles.roleChips} aria-label={t("games.search.rolesLabel")}>
                      {ROLE_POSITIONS.map((role) => {
                        const claimed = isRecruitParty && claimedRoles.has(role);
                        const looking = isRecruitParty && lookingRoles.has(role);
                        const personal = !isRecruitParty && player.roles.includes(role);

                        return (
                          <span
                            className={`${styles.roleChip}${
                              claimed
                                ? ` ${styles.roleChipClaimed}`
                                : looking
                                  ? ` ${styles.roleChipLooking}`
                                  : personal
                                    ? ` ${styles.roleChipActive}`
                                    : ""
                            }`}
                            key={`${player.slug}-role-${role}`}
                            title={
                              claimed
                                ? getDotaPositionLabel(role, t)
                                : looking
                                  ? t("games.search.applyForRole", {
                                      role: `${role} ${getDotaPositionLabel(role, t)}`
                                    })
                                  : undefined
                            }
                          >
                            {role}
                          </span>
                        );
                      })}
                    </div>
                    <span>{player.server ?? "—"}</span>
                  </div>
                  <div className={styles.flagRow}>
                    {(player.greenFlags ?? []).map((flag) => (
                      <span className={styles.flagGreen} key={`${player.slug}-g-${flag.key}`}>
                        {getDotaGreenFlagLabel(flag.key as DotaGreenFlagKey, t)}
                        {flag.count > 1 ? ` · ${flag.count}` : ""}
                      </span>
                    ))}
                    {(player.redFlags ?? []).map((flag) => (
                      <span className={styles.flagRed} key={`${player.slug}-r-${flag.key}`}>
                        {getDotaRedFlagLabel(flag.key as DotaRedFlagKey, t)}
                        {flag.count > 1 ? ` · ${flag.count}` : ""}
                      </span>
                    ))}
                    {(player.redFlags?.length ?? 0) === 0 && (player.greenFlags?.length ?? 0) === 0 ? (
                      <span className={styles.flagEmpty}>{t("games.search.noFlagsYet")}</span>
                    ) : null}
                  </div>
                  {isRecruitParty && (player.recruitedRoles?.length ?? 0) > 0 ? (
                    <div className={styles.applyRoleRow}>
                      {player.recruitedRoles.map((role) => {
                        const busyKey = `${player.slug}:${role}`;
                        return (
                          <button
                            className={`button-primary ${styles.applyRoleBtn}`}
                            disabled={stackBusySlug === busyKey}
                            key={busyKey}
                            onClick={() => void handleStack(player.slug, role as DotaPositionRole)}
                            type="button"
                          >
                            {stackBusySlug === busyKey
                              ? t("games.search.stackBusy")
                              : t("games.search.applyForRole", {
                                  role: `${role} ${getDotaPositionLabel(role, t)}`
                                })}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className={styles.inviteWrap}
                      data-invite-picker={player.slug}
                    >
                      <button
                        aria-expanded={invitePickerSlug === player.slug}
                        aria-haspopup="dialog"
                        className={`button-primary ${styles.stackCta}`}
                        disabled={stackBusySlug === player.slug}
                        onClick={() =>
                          setInvitePickerSlug((current) =>
                            current === player.slug ? null : player.slug
                          )
                        }
                        type="button"
                      >
                        {stackBusySlug === player.slug
                          ? t("games.search.stackBusy")
                          : t("games.search.stackCta")}
                      </button>
                      {invitePickerSlug === player.slug ? (
                        <div
                          aria-label={t("games.search.stackAs")}
                          className={styles.invitePopover}
                          role="dialog"
                        >
                          <p className={styles.invitePopoverTitle}>{t("games.search.stackAs")}</p>
                          <button
                            className={styles.invitePopoverOption}
                            disabled={Boolean(stackBusySlug)}
                            onClick={() => void handleStack(player.slug, undefined, "")}
                            type="button"
                          >
                            {t("games.search.stackAsNewParty")}
                          </button>
                          {ownedParties.map((party) => {
                            const full = party.openSlots <= 0;
                            return (
                              <button
                                className={styles.invitePopoverOption}
                                disabled={full || Boolean(stackBusySlug)}
                                key={`invite-to-${party.id}`}
                                onClick={() =>
                                  void handleStack(player.slug, undefined, party.slug)
                                }
                                type="button"
                              >
                                {party.kind === "TEAM"
                                  ? t("games.search.stackAsTeam", { name: party.name })
                                  : t("games.search.stackAsParty", { name: party.name })}
                                {full ? ` · ${t("games.search.partyFullCta")}` : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside
          className={styles.sidebar}
          ref={(node) => {
            railRef.current = node;
          }}
        >
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{t("games.search.invitesTitle")}</h2>
              {invites.length > 0 ? (
                <span className={styles.countBadge}>{invites.length}</span>
              ) : null}
            </div>
            {invites.length === 0 && isLooking ? (
              <div className={styles.waitingInvite} role="status">
                <div aria-hidden="true" className={styles.waitingDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <p className={styles.waitingInviteText}>{t("games.search.invitesWaiting")}</p>
              </div>
            ) : invites.length === 0 ? (
              <p className={styles.panelEmpty}>{t("games.search.invitesEmpty")}</p>
            ) : (
              <ul className={styles.inviteList}>
                {invites.map((invite) => {
                  const isApplication = invite.inviteKind === "APPLICATION";
                  return (
                    <li className={`${styles.inviteItem} ${styles.inviteIncoming}`} key={invite.id}>
                      <div className={styles.inviteRow}>
                        <span aria-hidden="true" className={styles.inviteAvatar}>
                          {playerInitial(invite.partyName)}
                        </span>
                        <div className={styles.inviteCopy}>
                          <strong>{invite.partyName}</strong>
                          <span className={styles.inviteWant}>
                            {isApplication
                              ? t("games.search.applicationPending", {
                                  role: invite.positionRole
                                    ? `${invite.positionRole} ${getDotaPositionLabel(invite.positionRole, t)}`
                                    : "—"
                                })
                              : t("games.search.inviteWantsYou")}
                          </span>
                        </div>
                        <div className={styles.inviteActions}>
                          {!isApplication ? (
                            <button
                              aria-label={t("games.search.inviteAccept")}
                              className={styles.acceptBtn}
                              disabled={inviteBusyId === invite.id}
                              onClick={() => void handleAcceptInvite(invite)}
                              type="button"
                            >
                              ✓
                            </button>
                          ) : null}
                          <button
                            aria-label={
                              isApplication
                                ? t("games.search.withdrawApplication")
                                : t("games.search.inviteDecline")
                            }
                            className={styles.declineBtn}
                            disabled={inviteBusyId === invite.id}
                            onClick={() => void handleDeclineInvite(invite)}
                            type="button"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t("games.search.outgoingTitle")}</h2>
            {visibleOutgoing.length === 0 ? (
              <p className={styles.panelEmpty}>{t("games.search.outgoingEmpty")}</p>
            ) : (
              <ul className={styles.inviteList}>
                {visibleOutgoing.map((invite) => {
                  const isApplication = invite.inviteKind === "APPLICATION";
                  const canDecide =
                    isApplication && invite.status === "PENDING" && invite.direction === "outgoing";
                  return (
                    <li
                      className={`${styles.inviteItem} ${outgoingInviteClass(invite.status, styles)}`}
                      key={invite.id}
                    >
                      <div className={styles.inviteRow}>
                        <span aria-hidden="true" className={styles.inviteAvatar}>
                          {playerInitial(invite.inviteeDisplayName)}
                        </span>
                        <div className={styles.inviteCopy}>
                          {invite.inviteeDotaSlug ? (
                            <Link href={`/dota/${invite.inviteeDotaSlug}`}>
                              <strong>{invite.inviteeDisplayName}</strong>
                            </Link>
                          ) : (
                            <strong>{invite.inviteeDisplayName}</strong>
                          )}
                          <span>
                            {invite.status === "PENDING"
                              ? isApplication
                                ? t("games.search.applicationForRole", {
                                    role: invite.positionRole
                                      ? `${invite.positionRole} ${getDotaPositionLabel(invite.positionRole, t)}`
                                      : "—"
                                  })
                                : t("games.search.outgoingPending")
                              : invite.status === "ACCEPTED"
                                ? t("games.search.outgoingAccepted")
                                : t("games.search.outgoingDeclined")}
                          </span>
                        </div>
                        {canDecide ? (
                          <div className={styles.inviteActions}>
                            <button
                              aria-label={t("games.search.acceptApplication")}
                              className={styles.acceptBtn}
                              disabled={inviteBusyId === invite.id}
                              onClick={() => void handleAcceptInvite(invite)}
                              type="button"
                            >
                              ✓
                            </button>
                            <button
                              aria-label={t("games.search.declineApplication")}
                              className={styles.declineBtn}
                              disabled={inviteBusyId === invite.id}
                              onClick={() => void handleDeclineInvite(invite)}
                              type="button"
                            >
                              ✕
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {(invite.redFlags?.length ?? 0) > 0 || (invite.greenFlags?.length ?? 0) > 0 ? (
                        <div className={styles.inviteFlags}>
                          {(invite.redFlags ?? []).map((flag) => (
                            <span className={styles.flagRed} key={`${invite.id}-r-${flag.key}`}>
                              {getDotaRedFlagLabel(flag.key as DotaRedFlagKey, t)}
                              {flag.count > 1 ? ` · ${flag.count}` : ""}
                            </span>
                          ))}
                          {(invite.greenFlags ?? []).map((flag) => (
                            <span className={styles.flagGreen} key={`${invite.id}-g-${flag.key}`}>
                              {getDotaGreenFlagLabel(flag.key as DotaGreenFlagKey, t)}
                              {flag.count > 1 ? ` · ${flag.count}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t("games.search.howTitle")}</h2>
            <ol className={styles.howList}>
              <li>{t("games.search.howStep1")}</li>
              <li>{t("games.search.howStep2")}</li>
              <li>{t("games.search.howStep3")}</li>
              <li>{t("games.search.howStep4")}</li>
            </ol>
          </section>

          <section className={`${styles.panel} ${styles.tipPanel}`}>
            <p className={styles.tipTitle}>{t("games.search.tipTitle")}</p>
            <p className={styles.tipLead}>{t("games.search.tipLead")}</p>
          </section>
        </aside>
        </div>

        {cinematicMode === "active" ? (
          <GamesSearchCinematic
            onComplete={handleCinematicComplete}
            onPrepared={handleCinematicPrepared}
            onVisualPhase={setCinematicVisualPhase}
          />
        ) : null}
      </div>

      <GamesSearchOnboarding
        onClose={closeCoach}
        open={coachOpen}
        targetRef={intentCoachRef}
      />

      {gateSlug ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div aria-modal="true" className={styles.modal} role="dialog">
            <h2 className={styles.emptyTitle}>{t("games.search.gateTitle")}</h2>
            <p className={styles.emptyLead}>{t("games.search.gateLead")}</p>
            <div className={styles.modalActions}>
              <Link className="button-primary" href={createHref}>
                {t("games.search.gateCta")}
              </Link>
              <button className="button-secondary" onClick={() => setGateSlug(null)} type="button">
                {t("games.search.gateClose")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
