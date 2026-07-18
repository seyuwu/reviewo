"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";

import { useTranslation } from "../features/i18n/locale-provider";
import {
  getGamesEntryUrl,
  getOpiniaHomeUrl,
  isGamesVerticalHostname
} from "../lib/config/product-hosts";

const SWITCH_SEEN_KEY = "opinia.productSwitchSeen";
const SWITCH_PEEK_KEY = "opinia.productSwitchPeeked";

interface ProductBrandSwitcherProps {
  mode: "games" | "opinia";
}

export function ProductBrandSwitcher({ mode }: ProductBrandSwitcherProps) {
  const t = useTranslation();
  const pathname = usePathname();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [onGamesHost, setOnGamesHost] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const peekTimerRef = useRef<number | null>(null);
  const suppressUntilLeaveRef = useRef(false);

  const previousModeRef = useRef(mode);
  const homeHref = mode === "games" ? "/games/search" : "/";
  // On games./dota. hosts, "/" is rewritten to /games/search by middleware — leave via absolute main site URL.
  const opiniaHref = onGamesHost ? getOpiniaHomeUrl() : "/";
  // Games menu temporarily lands on the Dota host (same search vertical).
  const gamesHref = getGamesEntryUrl();

  useEffect(() => {
    setOnGamesHost(isGamesVerticalHostname(window.location.hostname));
  }, []);

  useEffect(() => {
    if (previousModeRef.current === mode) {
      return;
    }

    previousModeRef.current = mode;
    suppressUntilLeaveRef.current = true;
    setOpen(false);

    if (typeof document !== "undefined" && rootRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const seen = window.localStorage.getItem(SWITCH_SEEN_KEY) === "1";
    setHighlight(!seen);

    if (seen || window.sessionStorage.getItem(SWITCH_PEEK_KEY) === "1") {
      return;
    }

    window.sessionStorage.setItem(SWITCH_PEEK_KEY, "1");
    peekTimerRef.current = window.setTimeout(() => {
      if (!suppressUntilLeaveRef.current) {
        setOpen(true);
      }

      peekTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        peekTimerRef.current = null;
      }, 2200);
    }, 700);

    return () => {
      if (peekTimerRef.current !== null) {
        window.clearTimeout(peekTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }

      if (peekTimerRef.current !== null) {
        window.clearTimeout(peekTimerRef.current);
      }
    };
  }, []);

  function markSeen() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SWITCH_SEEN_KEY, "1");
    }

    setHighlight(false);
  }

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openMenu() {
    if (suppressUntilLeaveRef.current) {
      return;
    }

    clearCloseTimer();
    setOpen(true);
    markSeen();
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }

  function handleLeave() {
    suppressUntilLeaveRef.current = false;
    scheduleClose();
  }

  function handleSelect() {
    markSeen();
    suppressUntilLeaveRef.current = true;
    setOpen(false);
    clearCloseTimer();

    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function handleBrandHomeClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    markSeen();
    suppressUntilLeaveRef.current = true;
    setOpen(false);
    clearCloseTimer();

    if (peekTimerRef.current !== null) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }

    if (pathname === homeHref) {
      event.preventDefault();
    }
  }

  const brandLabel = mode === "games" ? t("web.vertical.gamesBrand") : t("brand.name");
  const otherLabel = mode === "games" ? t("web.vertical.opinia") : t("web.vertical.games");

  return (
    <div
      className={`product-brand-switcher${open ? " is-open" : ""}${highlight ? " is-highlight" : ""}`}
      onMouseEnter={openMenu}
      onMouseLeave={handleLeave}
      ref={rootRef}
    >
      <Link
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("web.vertical.brandHomeAria", { brand: brandLabel })}
        className="product-brand-switcher-trigger"
        href={homeHref}
        onClick={handleBrandHomeClick}
      >
        <span className="product-brand-switcher-label">{brandLabel}</span>
        {highlight ? (
          <span className="product-brand-switcher-hint">{t("web.vertical.switchHint", { other: otherLabel })}</span>
        ) : null}
      </Link>

      <div
        aria-hidden={!open}
        aria-label={t("web.vertical.menuAriaLabel")}
        className="product-brand-menu"
        id={menuId}
        role="menu"
      >
        <div className="product-brand-menu-panel">
          <p className="product-brand-menu-caption">{t("web.vertical.menuCaption")}</p>
          <Link
            aria-current={mode === "opinia" ? "page" : undefined}
            className={`product-brand-menu-item${mode === "opinia" ? " is-active" : ""}`}
            href={opiniaHref}
            onClick={handleSelect}
            role="menuitem"
          >
            {t("web.vertical.opinia")}
          </Link>
          <Link
            aria-current={mode === "games" ? "page" : undefined}
            className={`product-brand-menu-item${mode === "games" ? " is-active" : ""}`}
            href={gamesHref}
            onClick={handleSelect}
            role="menuitem"
          >
            {t("web.vertical.games")}
          </Link>
        </div>
      </div>
    </div>
  );
}
