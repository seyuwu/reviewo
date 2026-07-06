"use client";

import { useEffect, useSyncExternalStore } from "react";

const PRESENCE_STORAGE_KEY = "reviewo.extensionPresent";
const PING_DELAYS_MS = [0, 200, 600, 1500, 3000];

type Listener = () => void;

let isPresent = typeof window !== "undefined" ? readStoredPresence() : false;
let isProbeActive = false;
let probeRefCount = 0;
const listeners = new Set<Listener>();

function readStoredPresence(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(PRESENCE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistPresence(): void {
  try {
    window.sessionStorage.setItem(PRESENCE_STORAGE_KEY, "1");
  } catch {
    // Ignore private mode / blocked storage.
  }
}

function pingExtension(): void {
  window.postMessage({ source: "reviewo-web", type: "reviewo:extension-ping" }, window.location.origin);
}

function markExtensionPresent(): void {
  if (isPresent) {
    return;
  }

  isPresent = true;
  persistPresence();
  listeners.forEach((listener) => listener());
}

function handlePresenceMessage(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  if (
    event.data?.source === "reviewo-extension" &&
    event.data?.type === "reviewo:extension-present"
  ) {
    markExtensionPresent();
  }
}

function handleFocus(): void {
  if (!isPresent) {
    pingExtension();
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    handleFocus();
  }
}

let pingTimeouts: number[] = [];

function activateProbe(): void {
  if (isProbeActive || typeof window === "undefined") {
    return;
  }

  isProbeActive = true;
  window.addEventListener("message", handlePresenceMessage);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  pingTimeouts = PING_DELAYS_MS.map((delay) => window.setTimeout(pingExtension, delay));
}

function deactivateProbe(): void {
  if (!isProbeActive || typeof window === "undefined") {
    return;
  }

  isProbeActive = false;
  window.removeEventListener("message", handlePresenceMessage);
  window.removeEventListener("focus", handleFocus);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  pingTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  pingTimeouts = [];
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return isPresent;
}

function startExtensionProbe(): () => void {
  probeRefCount += 1;

  if (probeRefCount === 1) {
    if (readStoredPresence()) {
      markExtensionPresent();
    }

    activateProbe();

    if (!isPresent) {
      pingExtension();
    }
  }

  return () => {
    probeRefCount = Math.max(0, probeRefCount - 1);

    if (probeRefCount === 0) {
      deactivateProbe();
    }
  };
}

export function useReviewoExtensionPresence(): boolean {
  const detected = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => startExtensionProbe(), []);

  return detected;
}
