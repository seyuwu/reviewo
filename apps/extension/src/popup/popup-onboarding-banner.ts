import type { TranslateFn } from "@reviewo/i18n";

import { dismissPopupWelcome, isPopupWelcomeDismissed } from "../shared/extension-onboarding-storage.js";
import { formatRatingCardHotkeyLabel } from "../shared/rating-card-hotkey.js";
import type { ExtensionUserPreferences } from "../shared/preferences.js";

export async function shouldShowPopupWelcomeBanner(): Promise<boolean> {
  return !(await isPopupWelcomeDismissed());
}

export function renderPopupWelcomeBannerMarkup(
  preferences: ExtensionUserPreferences,
  t: TranslateFn
): string {
  const hotkeyLabel = formatRatingCardHotkeyLabel(preferences.ratingCardHotkey, t);

  return `
    <section class="popup-onboarding-banner ui-fade-soft" data-popup-onboarding-banner>
      <div class="popup-onboarding-banner-copy">
        <p class="popup-onboarding-banner-title">${escapeHtmlText(t("onboarding.popup.title"))}</p>
        <ul class="popup-onboarding-banner-list">
          <li>${escapeHtmlText(t("onboarding.popup.hotkeyTip", { hotkey: hotkeyLabel }))}</li>
          <li>${escapeHtmlText(t("onboarding.popup.settingsTip"))}</li>
        </ul>
      </div>
      <div class="popup-onboarding-banner-actions">
        <button type="button" class="secondary-button" data-open-settings-from-banner>${escapeHtmlText(t("onboarding.popup.openSettings"))}</button>
        <button type="button" class="footer-button" data-dismiss-popup-onboarding>${escapeHtmlText(t("common.gotIt"))}</button>
      </div>
    </section>
  `;
}

export function bindPopupWelcomeBanner(
  container: HTMLElement,
  onOpenSettings: () => void
): void {
  const banner = container.querySelector<HTMLElement>("[data-popup-onboarding-banner]");

  if (!banner) {
    return;
  }

  banner.querySelector("[data-open-settings-from-banner]")?.addEventListener("click", () => {
    onOpenSettings();
  });

  banner.querySelector("[data-dismiss-popup-onboarding]")?.addEventListener("click", () => {
    banner.remove();
    void dismissPopupWelcome();
  });
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
