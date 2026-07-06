import { extensionConfig } from "./config.js";

const OPINIA_DEV_WEB_ORIGINS = new Set(["http://localhost:3001", "http://127.0.0.1:3001"]);

export function isReviewoWebPage(pageUrl?: string): boolean {
  try {
    const origin = pageUrl ? new URL(pageUrl).origin : window.location.origin;

    if (OPINIA_DEV_WEB_ORIGINS.has(origin)) {
      return true;
    }

    return origin === new URL(extensionConfig.webBaseUrl).origin;
  } catch {
    return false;
  }
}
