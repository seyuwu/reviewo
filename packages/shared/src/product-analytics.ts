export const ANALYTICS_COUNTER_KEYS = [
  "pageviews",
  "registrations",
  "funnel_home",
  "funnel_games",
  "funnel_dota",
  "funnel_register",
  "funnel_dota_profile",
  "dota_host_pageviews",
  "waitlist_interest_submit"
] as const;

export type AnalyticsCounterKey = (typeof ANALYTICS_COUNTER_KEYS)[number];

export const ANALYTICS_CTA_KEYS = [
  "games_hero_profile",
  "games_invite_friends",
  "games_open_dota",
  "games_suggestions_mail",
  "header_games",
  "header_search",
  "auth_register_submit",
  "auth_login_submit",
  "dota_create_submit",
  "dota_share_profile",
  "dota_share_friend",
  "home_quick_games",
  "home_create_entity",
  "games_waitlist_form_start",
  "games_waitlist_telegram_join",
  "games_waitlist_invite_click",
  "games_waitlist_invite_visit",
  "games_waitlist_create_profile_click",
  "games_search_start_join",
  "games_search_start_recruit",
  "games_search_stop",
  "games_party_create_from_search"
] as const;

export type AnalyticsCtaKey = (typeof ANALYTICS_CTA_KEYS)[number];

export const ANALYTICS_PATH_KEYS = [
  "home",
  "games",
  "dota",
  "dota_create",
  "dota_profile",
  "dota_team",
  "auth",
  "search",
  "entities",
  "battles",
  "tops",
  "profile",
  "admin",
  "other"
] as const;

export type AnalyticsPathKey = (typeof ANALYTICS_PATH_KEYS)[number];

const COUNTER_KEY_SET = new Set<string>(ANALYTICS_COUNTER_KEYS);
const CTA_KEY_SET = new Set<string>(ANALYTICS_CTA_KEYS);
const PATH_KEY_SET = new Set<string>(ANALYTICS_PATH_KEYS);

export function isAnalyticsCounterKey(value: string): value is AnalyticsCounterKey {
  return COUNTER_KEY_SET.has(value);
}

export function isAnalyticsCtaKey(value: string): value is AnalyticsCtaKey {
  return CTA_KEY_SET.has(value);
}

export function isAnalyticsPathKey(value: string): value is AnalyticsPathKey {
  return PATH_KEY_SET.has(value);
}

/** Map pathname → coarse bucket (keeps cardinality tiny). */
export function bucketAnalyticsPath(pathname: string): AnalyticsPathKey {
  const path = pathname.split("?")[0] || "/";

  if (path === "/") {
    return "home";
  }

  if (path.startsWith("/games")) {
    return "games";
  }

  if (path.startsWith("/dota/create")) {
    return "dota_create";
  }

  if (path.startsWith("/dota/teams")) {
    return "dota_team";
  }

  if (/^\/dota\/[^/]+/.test(path) && !path.startsWith("/dota/id")) {
    return "dota_profile";
  }

  if (path.startsWith("/dota")) {
    return "dota";
  }

  if (path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/auth")) {
    return "auth";
  }

  if (path.startsWith("/search")) {
    return "search";
  }

  if (path.startsWith("/entities") || path.startsWith("/e/")) {
    return "entities";
  }

  if (path.startsWith("/battles")) {
    return "battles";
  }

  if (path.startsWith("/tops") || path.startsWith("/top")) {
    return "tops";
  }

  if (path.startsWith("/profile") || path.startsWith("/me")) {
    return "profile";
  }

  if (path.startsWith("/admin")) {
    return "admin";
  }

  return "other";
}

export function funnelStepForPath(pathname: string): AnalyticsCounterKey | null {
  const path = pathname.split("?")[0] || "/";

  if (path === "/") {
    return "funnel_home";
  }

  if (path.startsWith("/games")) {
    return "funnel_games";
  }

  if (path.startsWith("/dota/create")) {
    return "funnel_dota_profile";
  }

  if (path.startsWith("/dota")) {
    return "funnel_dota";
  }

  if (path.startsWith("/register") || path.startsWith("/login")) {
    return "funnel_register";
  }

  return null;
}

/** Daily unique visitor hash scoped to the Dota product host. */
export function dotaHostVisitorScopeKey(visitorHash: string): string {
  return `dota:${visitorHash}`;
}

export function isDotaHostVisitorScopeKey(visitorHash: string): boolean {
  return visitorHash.startsWith("dota:");
}

export const WAITLIST_INVITE_QUERY = "from";
export const WAITLIST_INVITE_VALUE = "waitlist_invite";

