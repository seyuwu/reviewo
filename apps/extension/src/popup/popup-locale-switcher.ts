import type { LocalePreference, TranslateFn } from "@reviewo/i18n";

import { saveLocalePreference } from "../shared/save-locale-preference.js";
import { escapeHtml } from "./view-helpers.js";

export function renderPopupLocaleSwitcherMarkup(
  t: TranslateFn,
  currentLocale: LocalePreference
): string {
  const options: Array<{ label: string; value: LocalePreference }> = [
    { label: "A", value: "auto" },
    { label: "EN", value: "en" },
    { label: "RU", value: "ru" }
  ];

  return `
    <div
      class="popup-locale-switcher"
      data-popup-locale-switcher
      role="group"
      aria-label="${escapeHtml(t("locale.label"))}"
    >
      ${options
        .map(
          ({ label, value }) => `
        <button
          type="button"
          class="popup-locale-switcher-button${currentLocale === value ? " is-active" : ""}"
          data-locale-value="${value}"
          aria-pressed="${currentLocale === value}"
          title="${escapeHtml(localeOptionTitle(t, value))}"
        >
          ${label}
        </button>
      `
        )
        .join("")}
    </div>
  `;
}

export function bindPopupLocaleSwitcher(
  footer: HTMLElement,
  onLocaleChanged: () => void
): void {
  const switcher = footer.querySelector<HTMLElement>("[data-popup-locale-switcher]");

  if (!switcher) {
    return;
  }

  switcher.querySelectorAll<HTMLButtonElement>("[data-locale-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextLocale = button.dataset.localeValue as LocalePreference | undefined;

      if (!nextLocale || button.classList.contains("is-active")) {
        return;
      }

      void saveLocalePreference(nextLocale).then(() => {
        onLocaleChanged();
      });
    });
  });
}

function localeOptionTitle(t: TranslateFn, value: LocalePreference): string {
  if (value === "auto") {
    return t("locale.auto");
  }

  if (value === "ru") {
    return t("locale.ru");
  }

  return t("locale.en");
}
