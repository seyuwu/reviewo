import {
  guardExtensionContext,
  onExtensionContextInvalidated,
  sendRuntimeMessage
} from "./extension-context.js";
import { createSyncWebAuthMessage } from "../shared/messages.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";

const WEB_AUTH_STORAGE_KEY = "reviewo.webAuth";

export function startWebAuthSync(): void {
  if (!isReviewoWebPage()) {
    return;
  }

  pushWebAuthToExtension();

  const onAuthMaybeChanged = (): void => {
    pushWebAuthToExtension();
  };

  const onStorageChanged = (event: StorageEvent): void => {
    if (event.key === WEB_AUTH_STORAGE_KEY) {
      onAuthMaybeChanged();
    }
  };

  const onVisibilityChanged = (): void => {
    if (document.visibilityState === "visible") {
      onAuthMaybeChanged();
    }
  };

  window.addEventListener("storage", onStorageChanged);
  window.addEventListener("focus", onAuthMaybeChanged);
  document.addEventListener("visibilitychange", onVisibilityChanged);
  window.addEventListener("reviewo:web-auth-changed", onAuthMaybeChanged);

  onExtensionContextInvalidated(() => {
    window.removeEventListener("storage", onStorageChanged);
    window.removeEventListener("focus", onAuthMaybeChanged);
    document.removeEventListener("visibilitychange", onVisibilityChanged);
    window.removeEventListener("reviewo:web-auth-changed", onAuthMaybeChanged);
  });
}

function pushWebAuthToExtension(): void {
  if (!guardExtensionContext()) {
    return;
  }

  const rawAuthJson = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY);
  sendRuntimeMessage(createSyncWebAuthMessage(rawAuthJson));
}
