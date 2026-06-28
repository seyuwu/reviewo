import type { LocalePreference } from "@reviewo/i18n";
import { DEFAULT_LOCALE_PREFERENCE } from "@reviewo/i18n";

export type PopupReviewDisplayMode = "compact" | "full";

export type CardPlacement =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export type { RatingCardHotkey } from "./rating-card-hotkey.js";
export { DEFAULT_RATING_CARD_HOTKEY } from "./rating-card-hotkey.js";

import type { RatingCardHotkey } from "./rating-card-hotkey.js";
import { DEFAULT_RATING_CARD_HOTKEY } from "./rating-card-hotkey.js";

export interface ExtensionUserPreferences {
  autoDismissSeconds: number;
  cardPlacement: CardPlacement;
  locale: LocalePreference;
  onSiteRatingCardEnabled: boolean;
  popupReviewDisplayMode: PopupReviewDisplayMode;
  popupReviewsLimit: number;
  ratingCardHotkey: RatingCardHotkey;
  ratingCardHotkeyEnabled: boolean;
}

export const EXTENSION_PREFERENCES_STORAGE_KEY = "reviewo.extensionPreferences";

export const DEFAULT_EXTENSION_PREFERENCES: ExtensionUserPreferences = {
  autoDismissSeconds: 3,
  cardPlacement: "bottom-right",
  locale: DEFAULT_LOCALE_PREFERENCE,
  onSiteRatingCardEnabled: true,
  popupReviewDisplayMode: "compact",
  popupReviewsLimit: 10,
  ratingCardHotkey: DEFAULT_RATING_CARD_HOTKEY,
  ratingCardHotkeyEnabled: true
};
