"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  bucketAnalyticsPath,
  isAnalyticsCtaKey,
  WAITLIST_INVITE_QUERY,
  WAITLIST_INVITE_VALUE,
  type AnalyticsCtaKey
} from "@reviewo/shared";

import { isGamesVerticalHostname } from "../../../lib/config/product-hosts";
import { publicEnv } from "../../../lib/config/public-env";

const VISITOR_KEY = "opinia.analytics.visitorId";
const FLUSH_MS = 15_000;
const MIN_VISIBLE_MS = 1_500;

type PendingEvent = {
  count?: number;
  durationMs?: number;
  key?: string;
  type: string;
};

let queue: PendingEvent[] = [];
let flushTimer: number | null = null;
let pageEnteredAt = 0;
let pagePath = "";
let accumulatedHiddenPause = 0;
let hiddenAt: number | null = null;
let lastPageviewAt = 0;

function getVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);

    if (existing && existing.length >= 8) {
      return existing;
    }

    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return `anon_${Date.now()}`;
  }
}

function enqueue(event: PendingEvent): void {
  queue.push(event);

  if (queue.length >= 20) {
    void flushQueue({ allowBeacon: false });
    return;
  }

  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flushQueue({ allowBeacon: false });
    }, FLUSH_MS);
  }
}

async function flushQueue(options: { allowBeacon: boolean }): Promise<boolean> {
  if (queue.length === 0) {
    return true;
  }

  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }

  const events = queue.splice(0, 40);
  const body = JSON.stringify({
    events,
    visitorId: getVisitorId()
  });
  const url = `${publicEnv.apiBaseUrl}/analytics/collect`;

  try {
    // Prefer fetch+keepalive. Cross-origin sendBeacon(application/json) cannot
    // complete CORS preflight and silently drops events while returning true.
    const response = await fetch(url, {
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
      mode: "cors"
    });

    if (!response.ok) {
      queue.unshift(...events);
      return false;
    }

    return true;
  } catch {
    if (options.allowBeacon && typeof navigator.sendBeacon === "function") {
      // Last-resort unload path only; text/plain avoids CORS preflight.
      // API still expects JSON — this rarely succeeds cross-origin, but does not
      // falsely report success the way application/json beacons did.
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(url, blob)) {
        return true;
      }
    }

    queue.unshift(...events);
    return false;
  }
}

function commitPageTime(): void {
  if (!pagePath || pageEnteredAt < 1) {
    return;
  }

  let elapsed = Date.now() - pageEnteredAt - accumulatedHiddenPause;

  if (hiddenAt !== null) {
    elapsed -= Date.now() - hiddenAt;
  }

  pageEnteredAt = Date.now();
  accumulatedHiddenPause = 0;
  hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;

  if (elapsed < MIN_VISIBLE_MS) {
    return;
  }

  enqueue({
    durationMs: Math.min(elapsed, 30 * 60 * 1000),
    key: bucketAnalyticsPath(pagePath),
    type: "page_time"
  });
}

function trackPageview(pathname: string): void {
  commitPageTime();

  // Guard against React Strict Mode / fast remount double pageviews.
  const now = Date.now();
  const shouldCountPageview = !(pathname === pagePath && now - lastPageviewAt < 800);
  pagePath = pathname;
  pageEnteredAt = now;
  accumulatedHiddenPause = 0;
  hiddenAt = document.visibilityState === "hidden" ? now : null;

  if (shouldCountPageview) {
    lastPageviewAt = now;
    enqueue({ key: pathname, type: "pageview" });

    if (isGamesProductHost()) {
      enqueue({ key: "dota_host_pageviews", type: "counter" });
    }
  }

  trackWaitlistInviteVisitOnce();
}

let inviteVisitQueued = false;

const INVITE_SHARE_AT_KEY = "opinia.waitlist.inviteShareAt";
const INVITE_VISIT_KEY = "opinia.waitlist.inviteVisit.v3";
/** Skip counting an invite visit shortly after this browser copied an invite link (self-test). */
const INVITE_SELF_OPEN_MS = 3 * 60 * 1000;

export function trackAnalyticsCta(ctaKey: AnalyticsCtaKey): Promise<boolean> {
  if (!isAnalyticsCtaKey(ctaKey)) {
    return Promise.resolve(false);
  }

  if (ctaKey === "games_waitlist_invite_click") {
    try {
      window.localStorage.setItem(INVITE_SHARE_AT_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  enqueue({ key: ctaKey, type: "cta" });
  // Waitlist / conversion CTAs should not wait for the 15s batch window.
  // Soft navigations do not abort keepalive fetch, so await this before Link nav.
  return flushQueue({ allowBeacon: false });
}

function trackWaitlistInviteVisitOnce(): void {
  if (typeof window === "undefined" || inviteVisitQueued) {
    return;
  }

  const inviteQuery = WAITLIST_INVITE_QUERY || "from";
  const inviteValue = WAITLIST_INVITE_VALUE || "waitlist_invite";
  const params = new URLSearchParams(window.location.search);

  if (params.get(inviteQuery) !== inviteValue) {
    return;
  }

  try {
    if (window.sessionStorage.getItem(INVITE_VISIT_KEY) === "1") {
      inviteVisitQueued = true;
      return;
    }

    const shareAt = Number(window.localStorage.getItem(INVITE_SHARE_AT_KEY) ?? "0");

    if (shareAt > 0 && Date.now() - shareAt < INVITE_SELF_OPEN_MS) {
      // Own invite link opened right after copy — mark seen, do not count as a friend visit.
      inviteVisitQueued = true;
      window.sessionStorage.setItem(INVITE_VISIT_KEY, "1");
      return;
    }
  } catch {
    /* ignore storage read failures */
  }

  // Guard React Strict Mode double-effect before the async flush finishes.
  inviteVisitQueued = true;
  enqueue({ key: "games_waitlist_invite_visit", type: "cta" });

  void flushQueue({ allowBeacon: false }).then((ok) => {
    if (!ok) {
      inviteVisitQueued = false;
      return;
    }

    try {
      window.sessionStorage.setItem(INVITE_VISIT_KEY, "1");
    } catch {
      /* ignore storage write failures */
    }
  });
}

function isGamesProductHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const host = window.location.hostname.toLowerCase();

  if (isGamesVerticalHostname(host) || host.startsWith("dota.") || host.startsWith("games.")) {
    return true;
  }

  // Local same-origin (localhost:3001): waitlist lives under /games and /dota.
  const path = window.location.pathname;
  return path.startsWith("/games") || path.startsWith("/dota");
}

export function ProductAnalyticsListener() {
  const pathname = usePathname();

  useEffect(() => {
    trackPageview(pathname);

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        // Commit BEFORE marking hidden — otherwise duration collapses to ~0.
        commitPageTime();
        void flushQueue({ allowBeacon: true });
      } else {
        hiddenAt = null;
        pageEnteredAt = Date.now();
        accumulatedHiddenPause = 0;
      }
    }

    function onClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const node = target.closest("[data-analytics]");

      if (!(node instanceof HTMLElement)) {
        return;
      }

      const cta = node.dataset.analytics;

      if (cta && isAnalyticsCtaKey(cta)) {
        trackAnalyticsCta(cta);
      }
    }

    function onPageHide() {
      commitPageTime();
      void flushQueue({ allowBeacon: true });
    }

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onPageHide);
      commitPageTime();
      void flushQueue({ allowBeacon: false });
    };
  }, [pathname]);

  return null;
}
