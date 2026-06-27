import {
  guardExtensionContext,
  onExtensionContextInvalidated,
  sendRuntimeMessage
} from "./extension-context.js";
import {
  createAuthSignOutMessage,
  createGetAuthSessionMessage,
  createSyncWebAuthMessage,
  ExtensionMessageType
} from "../shared/messages.js";
import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import {
  shouldPullExtensionAuthToWeb,
  shouldPushWebAuthToExtension
} from "../shared/web-auth-sync-policy.js";

const WEB_AUTH_STORAGE_KEY = "reviewo.webAuth";
const WEB_SIGNED_OUT_KEY = "reviewo.webSignedOut";
const WEB_AUTH_BRIDGE_SOURCE = "reviewo-web";

interface WebStoredAuthSession {
  accessToken?: unknown;
  displayName?: unknown;
  email?: unknown;
  userId?: unknown;
}

interface WebAuthBridgeMessage {
  source?: unknown;
  type?: unknown;
}

let lastKnownWebAuthJson: string | null | undefined;

export function startWebAuthSync(): void {
  if (!isReviewoWebPage()) {
    return;
  }

  void onAuthMaybeChanged();

  const handleFocus = (): void => {
    void onAuthMaybeChanged();
  };

  const onStorageChanged = (event: StorageEvent): void => {
    if (event.key === WEB_SIGNED_OUT_KEY && event.newValue === "1") {
      void handleWebSignOut();
      return;
    }

    if (event.key === WEB_AUTH_STORAGE_KEY || event.key === WEB_SIGNED_OUT_KEY) {
      void onAuthMaybeChanged();
    }
  };

  const onVisibilityChanged = (): void => {
    if (document.visibilityState === "visible") {
      void onAuthMaybeChanged();
    }
  };

  const onWebAuthBridgeMessage = (event: MessageEvent<WebAuthBridgeMessage>): void => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (event.data?.source !== WEB_AUTH_BRIDGE_SOURCE) {
      return;
    }

    if (event.data.type === "reviewo:web-sign-out") {
      void handleWebSignOut();
      return;
    }

    if (event.data.type === "reviewo:web-auth-changed") {
      void onAuthMaybeChanged();
    }
  };

  window.addEventListener("storage", onStorageChanged);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("message", onWebAuthBridgeMessage);
  document.addEventListener("visibilitychange", onVisibilityChanged);

  onExtensionContextInvalidated(() => {
    window.removeEventListener("storage", onStorageChanged);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("message", onWebAuthBridgeMessage);
    document.removeEventListener("visibilitychange", onVisibilityChanged);
  });
}

async function handleWebSignOut(): Promise<void> {
  lastKnownWebAuthJson = null;
  await signOutExtension();
}

async function onAuthMaybeChanged(): Promise<void> {
  const webSignedOutLocally = isWebSignedOutLocally();

  if (shouldPullExtensionAuthToWeb({ webSignedOutLocally })) {
    await pullExtensionAuthToWeb();
  }

  pushWebAuthToExtension();
}

function pushWebAuthToExtension(): void {
  if (!guardExtensionContext()) {
    return;
  }

  const rawAuthJson = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY);

  if (!shouldPushWebAuthToExtension(rawAuthJson, lastKnownWebAuthJson)) {
    if (lastKnownWebAuthJson === undefined) {
      lastKnownWebAuthJson = rawAuthJson;
    }

    return;
  }

  if (!rawAuthJson) {
    return;
  }

  lastKnownWebAuthJson = rawAuthJson;
  sendRuntimeMessage(createSyncWebAuthMessage(rawAuthJson));
}

function pullExtensionAuthToWeb(): Promise<void> {
  if (!guardExtensionContext()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    sendRuntimeMessage(createGetAuthSessionMessage(), (response) => {
      try {
        if (isWebSignedOutLocally()) {
          resolve();
          return;
        }

        if (response?.type !== ExtensionMessageType.AuthSessionResult) {
          resolve();
          return;
        }

        const extensionSession = response.payload?.session as
          | ExtensionStoredAuthSession
          | null
          | undefined;

        if (!extensionSession?.accessToken) {
          resolve();
          return;
        }

        const webSession = readWebAuthSession();

        if (!shouldApplyExtensionAuthToWeb(extensionSession, webSession)) {
          resolve();
          return;
        }

        const nextWebSession = {
          accessToken: extensionSession.accessToken,
          displayName: extensionSession.displayName,
          email: extensionSession.email,
          userId: extensionSession.userId
        };
        const serialized = JSON.stringify(nextWebSession);

        if (window.localStorage.getItem(WEB_AUTH_STORAGE_KEY) === serialized) {
          resolve();
          return;
        }

        if (isWebSignedOutLocally()) {
          resolve();
          return;
        }

        window.localStorage.removeItem(WEB_SIGNED_OUT_KEY);
        window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, serialized);
        window.postMessage(
          { source: WEB_AUTH_BRIDGE_SOURCE, type: "reviewo:web-auth-changed" },
          window.location.origin
        );
      } finally {
        resolve();
      }
    });
  });
}

function readWebAuthSession(): WebStoredAuthSession | null {
  if (isWebSignedOutLocally()) {
    return null;
  }

  const rawAuthJson = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY);

  if (!rawAuthJson) {
    return null;
  }

  try {
    return JSON.parse(rawAuthJson) as WebStoredAuthSession;
  } catch {
    return null;
  }
}

function shouldApplyExtensionAuthToWeb(
  extensionSession: ExtensionStoredAuthSession,
  webSession: WebStoredAuthSession | null
): boolean {
  if (isWebSignedOutLocally()) {
    return false;
  }

  if (!webSession || typeof webSession.accessToken !== "string") {
    return true;
  }

  if (webSession.accessToken === extensionSession.accessToken) {
    return false;
  }

  if (
    typeof webSession.userId === "string" &&
    webSession.userId === extensionSession.userId
  ) {
    return true;
  }

  return false;
}

function isWebSignedOutLocally(): boolean {
  return window.localStorage.getItem(WEB_SIGNED_OUT_KEY) === "1";
}

function signOutExtension(): Promise<void> {
  if (!guardExtensionContext()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    sendRuntimeMessage(createAuthSignOutMessage(), () => {
      resolve();
    });
  });
}
