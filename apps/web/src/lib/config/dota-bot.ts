import type { AnalyticsCtaKey } from "@reviewo/shared";

export const DOTA_BOT_USERNAME = "FDPdotabot";

export type DotaBotAcquisitionSource =
  | "seo"
  | "community"
  | "telegram"
  | "discord"
  | "vk"
  | "tiktok"
  | "youtube"
  | "twitch"
  | "steam"
  | "search"
  | "referral"
  | "streamer"
  | "site"
  | "other";

type DotaBotAttribution = {
  source: DotaBotAcquisitionSource;
  campaign?: string;
  capturedAt: number;
};

const ATTRIBUTION_STORAGE_KEY = "opinia.dotaBotAttribution.v1";
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACQUISITION_SOURCES: DotaBotAcquisitionSource[] = [
  "seo",
  "community",
  "telegram",
  "discord",
  "vk",
  "tiktok",
  "youtube",
  "twitch",
  "steam",
  "search",
  "referral",
  "streamer",
  "site",
  "other"
];
const DOTA_BOT_CTA_KEYS: Record<DotaBotAcquisitionSource, AnalyticsCtaKey> = {
  seo: "dota_bot_cta_seo",
  community: "dota_bot_cta_community",
  telegram: "dota_bot_cta_telegram",
  discord: "dota_bot_cta_discord",
  vk: "dota_bot_cta_vk",
  tiktok: "dota_bot_cta_tiktok",
  youtube: "dota_bot_cta_youtube",
  twitch: "dota_bot_cta_twitch",
  steam: "dota_bot_cta_steam",
  search: "dota_bot_cta_search",
  referral: "dota_bot_cta_referral",
  streamer: "dota_bot_cta_streamer",
  site: "dota_bot_cta_site",
  other: "dota_bot_cta_other"
};
const DOTA_BOT_LANDING_CTA_KEYS: Record<DotaBotAcquisitionSource, AnalyticsCtaKey> = {
  seo: "dota_bot_landing_view_seo",
  community: "dota_bot_landing_view_community",
  telegram: "dota_bot_landing_view_telegram",
  discord: "dota_bot_landing_view_discord",
  vk: "dota_bot_landing_view_vk",
  tiktok: "dota_bot_landing_view_tiktok",
  youtube: "dota_bot_landing_view_youtube",
  twitch: "dota_bot_landing_view_twitch",
  steam: "dota_bot_landing_view_steam",
  search: "dota_bot_landing_view_search",
  referral: "dota_bot_landing_view_referral",
  streamer: "dota_bot_landing_view_streamer",
  site: "dota_bot_landing_view_site",
  other: "dota_bot_landing_view_other"
};

export function buildDotaBotProfileUrl(): string {
  return `https://t.me/${DOTA_BOT_USERNAME}`;
}

export function buildDotaBotStartUrl(source: DotaBotAcquisitionSource, campaign?: string): string {
  const safeCampaign = campaign
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
  const payload = `src_${source}${safeCampaign ? `_${safeCampaign}` : ""}`;
  return `${buildDotaBotProfileUrl()}?start=${encodeURIComponent(payload)}`;
}

/** Save the first tagged site visit so navigation to the FDP landing page keeps attribution. */
export function captureDotaBotAttributionFromCurrentUrl(): DotaBotAcquisitionSource | null {
  if (typeof window === "undefined") return null;

  const current = readStoredDotaBotAttribution();
  if (current) return null;

  const params = new URLSearchParams(window.location.search);
  let rawSource = params.get("utm_source")?.toLowerCase();
  let referrerCampaign: string | undefined;
  if (!rawSource && document.referrer) {
    try {
      const referrerHost = new URL(document.referrer).hostname.toLowerCase();
      if (/(^|\.)((google\.[a-z.]+)|(yandex\.[a-z.]+))$/.test(referrerHost)) {
        rawSource = "search";
        referrerCampaign = referrerHost.startsWith("google.") ? "google" : "yandex";
      } else {
        const referrerChannels: Array<[RegExp, DotaBotAcquisitionSource]> = [
          [/(^|\.)t\.me$|(^|\.)telegram\.org$/, "telegram"],
          [/(^|\.)discord\.com$|(^|\.)discord\.gg$/, "discord"],
          [/(^|\.)vk\.com$|(^|\.)vk\.ru$/, "vk"],
          [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube"],
          [/(^|\.)tiktok\.com$/, "tiktok"],
          [/(^|\.)steamcommunity\.com$/, "steam"]
        ];
        const match = referrerChannels.find(([pattern]) => pattern.test(referrerHost));
        if (match) {
          rawSource = match[1];
          referrerCampaign = "referral";
        }
      }
    } catch {
      // Ignore malformed or browser-redacted referrers.
    }
  }
  if (!rawSource) return null;

  let sourceSlug = safeCampaignPart(rawSource, 48)?.replace(/-/g, "_").replace(/_+/g, "_");
  if (!sourceSlug) return null;
  if (/^(google|yandex)(_|$)/.test(sourceSlug)) {
    sourceSlug = `search_${sourceSlug}`;
  } else if (/^organic(_|$)/.test(sourceSlug)) {
    sourceSlug = `seo_${sourceSlug}`;
  }

  const matchedSource = ACQUISITION_SOURCES.find(
    (candidate) => sourceSlug === candidate || sourceSlug.startsWith(`${candidate}_`)
  );
  const source = matchedSource ?? "other";
  const sourceSuffix = matchedSource
    ? sourceSlug.slice(matchedSource.length).replace(/^_+/, "")
    : sourceSlug;
  const campaignParts = [
    sourceSuffix,
    safeCampaignPart(referrerCampaign),
    safeCampaignPart(params.get("utm_medium")),
    safeCampaignPart(params.get("utm_campaign")),
    safeCampaignPart(params.get("utm_content"))
  ].filter(Boolean);
  const campaign = campaignParts.join("_").slice(0, 48) || undefined;
  const attribution: DotaBotAttribution = {
    source,
    capturedAt: Date.now(),
    ...(campaign ? { campaign } : {})
  };

  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Attribution is optional; the Telegram link still opens without browser storage.
  }
  return source;
}

export function getDotaBotAttributionForVisit(
  fallbackSource: DotaBotAcquisitionSource
): DotaBotAttribution {
  const attribution = readStoredDotaBotAttribution();
  return attribution ?? { source: fallbackSource, capturedAt: Date.now() };
}

export function getDotaBotLandingViewCtaKey(source: DotaBotAcquisitionSource): AnalyticsCtaKey {
  return DOTA_BOT_LANDING_CTA_KEYS[source];
}

export function getDotaBotClickCtaKey(source: DotaBotAcquisitionSource): AnalyticsCtaKey {
  return DOTA_BOT_CTA_KEYS[source];
}

export function getDotaBotStartUrlForVisit(fallbackSource: DotaBotAcquisitionSource): string {
  const attribution = getDotaBotAttributionForVisit(fallbackSource);
  return buildDotaBotStartUrl(attribution.source, attribution.campaign);
}

function readStoredDotaBotAttribution(): DotaBotAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!value) return null;
    const attribution = JSON.parse(value) as Partial<DotaBotAttribution>;
    if (
      typeof attribution.capturedAt !== "number" ||
      Date.now() - attribution.capturedAt > ATTRIBUTION_TTL_MS ||
      !ACQUISITION_SOURCES.includes(attribution.source as DotaBotAcquisitionSource)
    ) {
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    const campaign =
      typeof attribution.campaign === "string"
        ? safeCampaignPart(attribution.campaign)?.slice(0, 48)
        : undefined;
    return {
      source: attribution.source as DotaBotAcquisitionSource,
      capturedAt: attribution.capturedAt,
      ...(campaign ? { campaign } : {})
    };
  } catch {
    return null;
  }
}

function safeCampaignPart(value: string | null | undefined, maxLength = 16): string | undefined {
  if (!value) return undefined;
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return slug || undefined;
}
