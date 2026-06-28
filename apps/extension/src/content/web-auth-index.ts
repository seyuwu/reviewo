import { installExtensionContextGuards } from "./extension-context.js";
import { startWebAuthSync } from "./web-auth-sync.js";
import { startWebLocaleSync } from "./web-locale-sync.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";

const EXTENSION_PRESENCE_SOURCE = "reviewo-extension";

installExtensionContextGuards();
announceExtensionPresence();
startWebAuthSync();
startWebLocaleSync();

function announceExtensionPresence(): void {
  if (!isReviewoWebPage()) {
    return;
  }

  const message = {
    source: EXTENSION_PRESENCE_SOURCE,
    type: "reviewo:extension-present"
  };

  window.postMessage(message, window.location.origin);
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (event.data?.source !== "reviewo-web" || event.data?.type !== "reviewo:extension-ping") {
      return;
    }

    window.postMessage(message, window.location.origin);
  });
}
