export type CardDisplayTarget = "both" | "current" | "parent";

export interface ExtensionUserPreferences {
  autoDismissSeconds: number;
  cardDisplayTarget: CardDisplayTarget;
}

export const EXTENSION_PREFERENCES_STORAGE_KEY = "reviewo.extensionPreferences";

export const DEFAULT_EXTENSION_PREFERENCES: ExtensionUserPreferences = {
  autoDismissSeconds: 3,
  cardDisplayTarget: "both"
};
