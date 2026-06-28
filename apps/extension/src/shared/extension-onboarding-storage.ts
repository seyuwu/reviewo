const ON_SITE_CARD_TIP_DISMISSED_KEY = "reviewo.onSiteCardTipDismissed";
const POPUP_WELCOME_DISMISSED_KEY = "reviewo.popupWelcomeDismissed";

export async function isOnSiteCardTipDismissed(): Promise<boolean> {
  return readDismissFlag(ON_SITE_CARD_TIP_DISMISSED_KEY);
}

export async function dismissOnSiteCardTip(): Promise<void> {
  await writeDismissFlag(ON_SITE_CARD_TIP_DISMISSED_KEY);
}

export async function isPopupWelcomeDismissed(): Promise<boolean> {
  return readDismissFlag(POPUP_WELCOME_DISMISSED_KEY);
}

export async function dismissPopupWelcome(): Promise<void> {
  await writeDismissFlag(POPUP_WELCOME_DISMISSED_KEY);
}

async function readDismissFlag(key: string): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(key);
    return stored[key] === true;
  } catch {
    return false;
  }
}

async function writeDismissFlag(key: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: true });
  } catch {
    // Ignore storage failures for optional onboarding hints.
  }
}
