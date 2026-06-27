export type PopupReviewDisplayMode = "compact" | "full";

export type CardPlacement =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export interface ExtensionUserPreferences {
  autoDismissSeconds: number;
  cardPlacement: CardPlacement;
  popupReviewDisplayMode: PopupReviewDisplayMode;
  popupReviewsLimit: number;
}

export const EXTENSION_PREFERENCES_STORAGE_KEY = "reviewo.extensionPreferences";

export const DEFAULT_EXTENSION_PREFERENCES: ExtensionUserPreferences = {
  autoDismissSeconds: 3,
  cardPlacement: "bottom-right",
  popupReviewDisplayMode: "compact",
  popupReviewsLimit: 10
};
