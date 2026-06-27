import { extensionConfig } from "./config.js";

export function isReviewoWebPage(pageUrl?: string): boolean {
  try {
    const origin = pageUrl ? new URL(pageUrl).origin : window.location.origin;

    return origin === new URL(extensionConfig.webBaseUrl).origin;
  } catch {
    return false;
  }
}
