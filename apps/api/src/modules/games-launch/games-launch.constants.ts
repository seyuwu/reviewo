/** Soft launch moment shown in UI: 19.07.2026 19:00 Europe/Moscow. */
export const GAMES_LAUNCH_AT_ISO = "2026-07-19T16:00:00.000Z";

export const GAMES_LAUNCH_SETTING_ID = "default";

export const GAMES_LAUNCH_STATUS_CACHE_TTL_MS = 10_000;

export const GAMES_LAUNCH_CHANNELS = [
  "telegram",
  "discord",
  "newsletter",
  "vk",
  "email",
  "other"
] as const;
export type GamesLaunchChannel = (typeof GAMES_LAUNCH_CHANNELS)[number];

export const GAMES_LAUNCH_SUGGESTION_SOURCES = ["search", "community"] as const;
export type GamesLaunchSuggestionSource = (typeof GAMES_LAUNCH_SUGGESTION_SOURCES)[number];

/** Tab names inside the Google spreadsheet (create these sheets once). */
export const GAMES_LAUNCH_SHEET_INTEREST = "Interest";
export const GAMES_LAUNCH_SHEET_SUGGESTIONS = "Suggestions";
