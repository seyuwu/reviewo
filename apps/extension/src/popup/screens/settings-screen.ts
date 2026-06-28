import type { TranslateFn } from "@reviewo/i18n";
import type { LocalePreference } from "@reviewo/i18n";

import {
  readExtensionPreferences,
  saveExtensionPreferences
} from "../../shared/extension-preferences-storage.js";
import { createExtensionTranslatorFromPreference } from "../../shared/extension-i18n.js";
import {
  captureRatingCardHotkeyFromKeyboardEvent,
  formatRatingCardHotkeyLabel
} from "../../shared/rating-card-hotkey.js";
import type { CardPlacement, ExtensionUserPreferences, PopupReviewDisplayMode } from "../../shared/preferences.js";

export async function renderSettingsScreen(container: HTMLElement): Promise<void> {
  const preferences = await readExtensionPreferences();
  const t = createExtensionTranslatorFromPreference(preferences.locale);
  const hotkeyLabel = formatRatingCardHotkeyLabel(preferences.ratingCardHotkey, t);

  container.innerHTML = `
    <section class="screen settings-screen">
      <div class="screen-heading">
        <h1>${escapeHtml(t("settings.title"))}</h1>
        <p>${escapeHtml(t("settings.subtitle"))}</p>
      </div>
      <form class="settings-form" data-settings-form>
        <fieldset class="settings-fieldset">
          <legend>${escapeHtml(t("locale.label"))}</legend>
          <label class="settings-radio">
            <input type="radio" name="locale" value="auto" ${preferences.locale === "auto" ? "checked" : ""} />
            <span>${escapeHtml(t("locale.auto"))}</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="locale" value="en" ${preferences.locale === "en" ? "checked" : ""} />
            <span>${escapeHtml(t("locale.en"))}</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="locale" value="ru" ${preferences.locale === "ru" ? "checked" : ""} />
            <span>${escapeHtml(t("locale.ru"))}</span>
          </label>
          <p class="muted-copy">${escapeHtml(t("locale.hint"))}</p>
        </fieldset>
        <label class="settings-toggle">
          <input
            type="checkbox"
            name="onSiteRatingCardEnabled"
            value="on"
            ${preferences.onSiteRatingCardEnabled ? "checked" : ""}
          />
          <span>${escapeHtml(t("settings.onSiteCardEnabled.label"))}</span>
        </label>
        <p class="muted-copy">${escapeHtml(t("settings.onSiteCardEnabled.hint"))}</p>
        <fieldset class="settings-fieldset">
          <legend>${escapeHtml(t("settings.hotkey.legend"))}</legend>
          <label class="settings-toggle">
            <input
              type="checkbox"
              name="ratingCardHotkeyEnabled"
              value="on"
              ${preferences.ratingCardHotkeyEnabled ? "checked" : ""}
            />
            <span>${escapeHtml(t("settings.hotkey.enabledLabel"))}</span>
          </label>
          <div class="settings-hotkey-row">
            <output class="settings-hotkey-display" data-hotkey-display>${escapeHtml(hotkeyLabel)}</output>
            <button type="button" class="secondary-button settings-hotkey-button" data-record-hotkey>
              ${escapeHtml(t("settings.hotkey.changeButton"))}
            </button>
          </div>
          <p class="muted-copy settings-hotkey-hint" data-hotkey-hint>
            ${escapeHtml(t("settings.hotkey.defaultHint"))}
          </p>
          <input type="hidden" name="ratingCardHotkeyCode" value="${preferences.ratingCardHotkey.code}" />
          <input type="hidden" name="ratingCardHotkeyAlt" value="${preferences.ratingCardHotkey.altKey ? "1" : "0"}" />
          <input type="hidden" name="ratingCardHotkeyCtrl" value="${preferences.ratingCardHotkey.ctrlKey ? "1" : "0"}" />
          <input type="hidden" name="ratingCardHotkeyShift" value="${preferences.ratingCardHotkey.shiftKey ? "1" : "0"}" />
          <input type="hidden" name="ratingCardHotkeyMeta" value="${preferences.ratingCardHotkey.metaKey ? "1" : "0"}" />
        </fieldset>
        <fieldset class="settings-fieldset" data-card-appearance-settings ${preferences.onSiteRatingCardEnabled ? "" : "disabled"}>
          <legend>${escapeHtml(t("settings.cardPlacement.legend"))}</legend>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="bottom-right" ${preferences.cardPlacement === "bottom-right" ? "checked" : ""} />
            <span>${escapeHtml(t("settings.cardPlacement.bottomRight"))}</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="bottom-left" ${preferences.cardPlacement === "bottom-left" ? "checked" : ""} />
            <span>${escapeHtml(t("settings.cardPlacement.bottomLeft"))}</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="top-right" ${preferences.cardPlacement === "top-right" ? "checked" : ""} />
            <span>${escapeHtml(t("settings.cardPlacement.topRight"))}</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="top-left" ${preferences.cardPlacement === "top-left" ? "checked" : ""} />
            <span>${escapeHtml(t("settings.cardPlacement.topLeft"))}</span>
          </label>
        </fieldset>
        <label class="field-label">
          ${escapeHtml(t("settings.autoDismiss.label"))}
          <input
            name="autoDismissSeconds"
            type="number"
            min="0"
            max="30"
            step="1"
            value="${preferences.autoDismissSeconds}"
          />
        </label>
        <p class="muted-copy">${escapeHtml(t("settings.autoDismiss.hint"))}</p>
        <fieldset class="settings-fieldset">
          <legend>${escapeHtml(t("settings.popupReviews.legend"))}</legend>
          <label class="field-label">
            ${escapeHtml(t("settings.popupReviews.limitLabel"))}
            <input
              name="popupReviewsLimit"
              type="number"
              min="1"
              max="50"
              step="1"
              value="${preferences.popupReviewsLimit}"
            />
          </label>
          <label class="settings-radio">
            <input type="radio" name="popupReviewDisplayMode" value="compact" ${preferences.popupReviewDisplayMode === "compact" ? "checked" : ""} />
            <span>${escapeHtml(t("settings.popupReviews.displayCompact"))}</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="popupReviewDisplayMode" value="full" ${preferences.popupReviewDisplayMode === "full" ? "checked" : ""} />
            <span>${escapeHtml(t("settings.popupReviews.displayFull"))}</span>
          </label>
        </fieldset>
        <p data-settings-status class="status-copy" hidden aria-live="polite"></p>
      </form>
    </section>
  `;

  const form = container.querySelector<HTMLFormElement>("[data-settings-form]");
  const statusElement = container.querySelector<HTMLParagraphElement>("[data-settings-status]");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  form.querySelectorAll<HTMLInputElement>(
    'input[type="radio"], input[type="number"], input[type="checkbox"]'
  ).forEach((input) => {
    input.addEventListener("change", () => {
      void persistSettings(form, statusElement, container);
    });
  });

  bindHotkeyRecorder(form, statusElement, container, t);
}

function bindHotkeyRecorder(
  form: HTMLFormElement,
  statusElement: HTMLParagraphElement | null,
  container: HTMLElement,
  t: TranslateFn
): void {
  const recordButton = form.querySelector<HTMLButtonElement>("[data-record-hotkey]");
  const hintElement = form.querySelector<HTMLElement>("[data-hotkey-hint]");
  let isRecording = false;
  let stopRecording: (() => void) | null = null;

  recordButton?.addEventListener("click", () => {
    if (isRecording) {
      stopRecording?.();
      return;
    }

    isRecording = true;
    recordButton.textContent = t("settings.hotkey.recordingButton");
    recordButton.classList.add("is-recording");

    if (hintElement) {
      hintElement.textContent = t("settings.hotkey.recordingHint");
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        stopRecording?.();
        return;
      }

      const captured = captureRatingCardHotkeyFromKeyboardEvent(event);

      if (!captured) {
        return;
      }

      event.preventDefault();
      applyHotkeyToForm(form, captured, t);
      stopRecording?.();
      void persistSettings(form, statusElement, container);
    };

    stopRecording = () => {
      isRecording = false;
      recordButton.textContent = t("settings.hotkey.changeButton");
      recordButton.classList.remove("is-recording");

      if (hintElement) {
        hintElement.textContent = t("settings.hotkey.defaultHint");
      }

      window.removeEventListener("keydown", onKeyDown, true);
      stopRecording = null;
    };

    window.addEventListener("keydown", onKeyDown, true);
  });
}

function applyHotkeyToForm(
  form: HTMLFormElement,
  hotkey: ExtensionUserPreferences["ratingCardHotkey"],
  t: TranslateFn
): void {
  const codeInput = form.querySelector<HTMLInputElement>('input[name="ratingCardHotkeyCode"]');
  const altInput = form.querySelector<HTMLInputElement>('input[name="ratingCardHotkeyAlt"]');
  const ctrlInput = form.querySelector<HTMLInputElement>('input[name="ratingCardHotkeyCtrl"]');
  const shiftInput = form.querySelector<HTMLInputElement>('input[name="ratingCardHotkeyShift"]');
  const metaInput = form.querySelector<HTMLInputElement>('input[name="ratingCardHotkeyMeta"]');
  const display = form.querySelector<HTMLOutputElement>("[data-hotkey-display]");

  if (codeInput) {
    codeInput.value = hotkey.code;
  }

  if (altInput) {
    altInput.value = hotkey.altKey ? "1" : "0";
  }

  if (ctrlInput) {
    ctrlInput.value = hotkey.ctrlKey ? "1" : "0";
  }

  if (shiftInput) {
    shiftInput.value = hotkey.shiftKey ? "1" : "0";
  }

  if (metaInput) {
    metaInput.value = hotkey.metaKey ? "1" : "0";
  }

  if (display) {
    display.textContent = formatRatingCardHotkeyLabel(hotkey, t);
  }
}

function syncCardAppearanceSettingsState(container: HTMLElement, enabled: boolean): void {
  const fieldset = container.querySelector<HTMLFieldSetElement>("[data-card-appearance-settings]");

  if (!fieldset) {
    return;
  }

  fieldset.disabled = !enabled;
}

function readPreferencesFromForm(form: HTMLFormElement): ExtensionUserPreferences {
  const formData = new FormData(form);

  return {
    autoDismissSeconds: Number(formData.get("autoDismissSeconds") ?? 3),
    cardPlacement: String(formData.get("cardPlacement") ?? "bottom-right") as CardPlacement,
    locale: String(formData.get("locale") ?? "auto") as LocalePreference,
    onSiteRatingCardEnabled: formData.get("onSiteRatingCardEnabled") === "on",
    popupReviewDisplayMode: String(
      formData.get("popupReviewDisplayMode") ?? "compact"
    ) as PopupReviewDisplayMode,
    popupReviewsLimit: Number(formData.get("popupReviewsLimit") ?? 10),
    ratingCardHotkey: {
      altKey: formData.get("ratingCardHotkeyAlt") === "1",
      code: String(formData.get("ratingCardHotkeyCode") ?? "KeyR"),
      ctrlKey: formData.get("ratingCardHotkeyCtrl") === "1",
      metaKey: formData.get("ratingCardHotkeyMeta") === "1",
      shiftKey: formData.get("ratingCardHotkeyShift") === "1"
    },
    ratingCardHotkeyEnabled: formData.get("ratingCardHotkeyEnabled") === "on"
  };
}

async function persistSettings(
  form: HTMLFormElement,
  statusElement: HTMLParagraphElement | null,
  container: HTMLElement
): Promise<void> {
  const previousLocale = (await readExtensionPreferences()).locale;
  const saved = await saveExtensionPreferences(readPreferencesFromForm(form));

  if (saved.locale !== previousLocale) {
    await renderSettingsScreen(container);
    return;
  }

  const t = createExtensionTranslatorFromPreference(saved.locale);
  syncCardAppearanceSettingsState(container, saved.onSiteRatingCardEnabled);
  applyHotkeyToForm(form, saved.ratingCardHotkey, t);

  if (!statusElement) {
    return;
  }

  statusElement.hidden = false;
  statusElement.textContent = t("settings.savedStatus");
  statusElement.classList.add("status-copy-success");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
