"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  bucketAnalyticsPath,
  isAnalyticsCtaKey,
  type AnalyticsCtaKey
} from "@reviewo/shared";

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

async function flushQueue(options: { allowBeacon: boolean }): Promise<void> {
  if (queue.length === 0) {
    return;
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
    // Regular flushes use fetch (more reliable CORS/JSON). Beacon only for unload.
    if (options.allowBeacon && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) {
        return;
      }
    }

    await fetch(url, {
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
      mode: "cors"
    });
  } catch {
    // Drop failed batches — analytics must never block UX.
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
  }
}

export function trackAnalyticsCta(ctaKey: AnalyticsCtaKey): void {
  if (!isAnalyticsCtaKey(ctaKey)) {
    return;
  }

  enqueue({ key: ctaKey, type: "cta" });
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
