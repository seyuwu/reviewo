"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { useTranslation } from "../features/i18n/locale-provider";
import { fetchMyParties } from "../features/social/api/social-api";
import {
  PARTY_NOTIFICATION_EVENT,
  type PartyNotificationEventDetail
} from "../features/social/lib/party-notifications-socket";
import type { GameParty } from "../features/social/types/social";
import { OpiniaIcon } from "./opinia-icon";

const MENU_ITEM_LIMIT = 8;

export function HeaderRostersMenu() {
  const t = useTranslation();
  const pathname = usePathname();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [team, setTeam] = useState<GameParty | null>(null);
  const [parties, setParties] = useState<GameParty[]>([]);
  const [portalReady, setPortalReady] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ left: 0, minWidth: 184, top: 0 });

  const isActive =
    pathname === "/games/community" ||
    pathname.startsWith("/games/community/") ||
    pathname.startsWith("/dota/teams/");

  const loadRosters = useCallback(async () => {
    if (!authSession?.accessToken) {
      setTeam(null);
      setParties([]);
      setLoadError(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(false);

    try {
      const response = await fetchMyParties(authSession.accessToken);
      setTeam(response.team);
      const partyItems = response.parties?.length
        ? response.parties
        : response.party
          ? [response.party]
          : [];
      setParties(partyItems);
    } catch {
      setTeam(null);
      setParties([]);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [authSession?.accessToken]);

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }

    void loadRosters();
  }, [isAuthSessionLoaded, loadRosters, pathname]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    function handlePartyNotification(event: Event) {
      const detail = (event as CustomEvent<PartyNotificationEventDetail>).detail;
      if (detail?.type === "accepted" || detail?.type === "member_joined") {
        void loadRosters();
      }
    }

    window.addEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
    return () => {
      window.removeEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
    };
  }, [authSession?.accessToken, loadRosters]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 10;
    const panelWidth = Math.min(288, window.innerWidth - viewportPadding * 2);

    setPanelPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - panelWidth - viewportPadding)
      ),
      minWidth: Math.max(184, rect.width),
      top: rect.bottom + 4
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const rosterItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ id: string; href: string; kind: "TEAM" | "PARTY"; name: string }> = [];

    function pushItem(roster: GameParty) {
      if (!roster.slug || seen.has(roster.id)) {
        return;
      }

      seen.add(roster.id);
      items.push({
        id: roster.id,
        href: `/dota/teams/${roster.slug}`,
        kind: roster.kind === "TEAM" ? "TEAM" : "PARTY",
        name: roster.name?.trim() || roster.slug
      });
    }

    if (team) {
      pushItem(team);
    }

    for (const party of parties) {
      pushItem(party);
    }

    return items;
  }, [parties, team]);

  const visibleItems = rosterItems.slice(0, MENU_ITEM_LIMIT);
  const hiddenCount = Math.max(0, rosterItems.length - visibleItems.length);

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openMenu() {
    clearCloseTimer();
    updatePanelPosition();
    setOpen(true);

    if (authSession?.accessToken) {
      void loadRosters();
    }
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }

  function handleSelect() {
    setOpen(false);
    clearCloseTimer();
  }

  const triggerClass = isActive
    ? "app-chrome-nav-link app-chrome-nav-link--tops is-active"
    : "app-chrome-nav-link app-chrome-nav-link--tops";

  let body: ReactNode;

  if (!isAuthSessionLoaded) {
    body = <p className="games-rosters-menu-empty">{t("common.loadingEllipsis")}</p>;
  } else if (!authSession) {
    body = <p className="games-rosters-menu-empty">{t("web.nav.rostersSignIn")}</p>;
  } else if (isLoading && rosterItems.length === 0) {
    body = <p className="games-rosters-menu-empty">{t("common.loadingEllipsis")}</p>;
  } else if (loadError && rosterItems.length === 0) {
    body = <p className="games-rosters-menu-empty">{t("web.nav.rostersLoadError")}</p>;
  } else if (rosterItems.length === 0) {
    body = <p className="games-rosters-menu-empty">{t("web.nav.rostersEmpty")}</p>;
  } else {
    body = (
      <ul className="games-rosters-menu-list">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <Link
              className="games-rosters-menu-item"
              href={item.href}
              onClick={handleSelect}
              role="menuitem"
            >
              <span className="games-rosters-menu-item-name">{item.name}</span>
              <span className="games-rosters-menu-item-kind">
                {item.kind === "TEAM" ? t("dota.team.kindTeam") : t("dota.team.kindParty")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <div
        className={`games-rosters-menu${open ? " is-open" : ""}`}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        ref={rootRef}
      >
        <Link
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          className={triggerClass}
          href="/games/community"
          onClick={handleSelect}
          title={t("web.nav.rosters")}
        >
          <span className="app-chrome-nav-icon app-chrome-nav-icon--tops">
            <OpiniaIcon className="app-chrome-nav-icon-svg" name="spotlight" />
          </span>
          <span>{t("web.nav.rosters")}</span>
        </Link>
      </div>

      {portalReady
        ? createPortal(
            <div className="games-rosters-menu-portal" data-product="games">
              <div
                aria-hidden={!open}
                aria-label={t("web.nav.rostersMenuAria")}
                className={`games-rosters-menu-panel-wrap${open ? " is-open" : ""}`}
                id={menuId}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                ref={panelRef}
                role="menu"
                style={panelPosition}
              >
                <div className="games-rosters-menu-panel">
                  {body}

                  {hiddenCount > 0 ? (
                    <Link
                      className="games-rosters-menu-more"
                      href="/games/community"
                      onClick={handleSelect}
                      role="menuitem"
                    >
                      {t("web.nav.rostersMore", { count: hiddenCount })}
                    </Link>
                  ) : null}

                  <div className="games-rosters-menu-footer">
                    <Link
                      className="games-rosters-menu-footer-link"
                      href="/games/community"
                      onClick={handleSelect}
                      role="menuitem"
                    >
                      {t("web.nav.rostersAll")}
                    </Link>
                    {authSession ? (
                      <Link
                        className="games-rosters-menu-footer-link"
                        href="/dota/teams/create"
                        onClick={handleSelect}
                        role="menuitem"
                      >
                        {t("web.nav.rostersCreate")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
