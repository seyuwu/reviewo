export type DotaAnalyticsEvent =
  | "dota_profile_created"
  | "dota_profile_updated"
  | "dota_share_copied"
  | "dota_confirmation_submitted"
  | "dota_confirmer_signup_started"
  | "party_created"
  | "party_invite_copied"
  | "party_invite_open_discord"
  | "party_invite_share_channel"
  | "party_landing_view"
  | "party_seat_intent"
  | "party_joined"
  | "party_applied";

interface DotaAnalyticsPayload {
  channel?: string;
  kind?: string;
  ref?: string;
  role?: string;
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
