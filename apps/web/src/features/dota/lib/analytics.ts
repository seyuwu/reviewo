export type DotaAnalyticsEvent =
  | "dota_profile_created"
  | "dota_profile_updated"
  | "dota_share_copied"
  | "dota_confirmation_submitted"
  | "dota_confirmer_signup_started";

interface DotaAnalyticsPayload {
  kind?: string;
  ref?: string;
  slug?: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackDotaEvent(event: DotaAnalyticsEvent, payload: DotaAnalyticsPayload = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  window.gtag?.("event", event, payload);
}
