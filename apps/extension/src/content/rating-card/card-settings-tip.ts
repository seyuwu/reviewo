import type { TranslateFn } from "@reviewo/i18n";

import {
  dismissOnSiteCardTip,
  isOnSiteCardTipDismissed
} from "../../shared/extension-onboarding-storage.js";

export function renderCardSettingsTipMarkup(
  hotkeyLabel: string,
  hotkeyEnabled: boolean,
  t: TranslateFn
): string {
  const hotkeyCopy = hotkeyEnabled
    ? t("card.settingsTip.hotkeyEnabled", {
        hotkey: `<span class="reviewo-settings-tip-kbd">${escapeHtmlText(hotkeyLabel)}</span>`
      })
    : "";

  return `
    <div class="reviewo-settings-tip" data-reviewo-settings-tip>
      <p class="reviewo-settings-tip-copy">
        <strong>${escapeHtmlText(t("card.settingsTip.prefix"))}</strong> ${hotkeyCopy}${escapeHtmlText(t("card.settingsTip.openSettings"))}
      </p>
      <button type="button" class="reviewo-settings-tip-dismiss" data-reviewo-settings-tip-dismiss>
        ${escapeHtmlText(t("common.gotIt"))}
      </button>
    </div>
  `;
}

export async function shouldShowCardSettingsTip(): Promise<boolean> {
  return !(await isOnSiteCardTipDismissed());
}

export function bindCardSettingsTip(cardElement: HTMLElement): void {
  const tip = cardElement.querySelector<HTMLElement>("[data-reviewo-settings-tip]");
  const dismissButton = cardElement.querySelector<HTMLButtonElement>(
    "[data-reviewo-settings-tip-dismiss]"
  );

  dismissButton?.addEventListener("click", () => {
    tip?.remove();
    void dismissOnSiteCardTip();
  });
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
