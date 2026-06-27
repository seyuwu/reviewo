import {
  readExtensionPreferences,
  saveExtensionPreferences
} from "../../shared/extension-preferences-storage.js";
import type { CardPlacement, ExtensionUserPreferences, PopupReviewDisplayMode } from "../../shared/preferences.js";

export async function renderSettingsScreen(container: HTMLElement): Promise<void> {
  const preferences = await readExtensionPreferences();

  container.innerHTML = `
    <section class="screen settings-screen">
      <div class="screen-heading">
        <h1>Settings</h1>
        <p>Control how Reviewo appears on pages you visit.</p>
      </div>
      <form class="settings-form" data-settings-form>
        <fieldset class="settings-fieldset">
          <legend>Card position</legend>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="bottom-right" ${preferences.cardPlacement === "bottom-right" ? "checked" : ""} />
            <span>Bottom right</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="bottom-left" ${preferences.cardPlacement === "bottom-left" ? "checked" : ""} />
            <span>Bottom left</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="top-right" ${preferences.cardPlacement === "top-right" ? "checked" : ""} />
            <span>Top right</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardPlacement" value="top-left" ${preferences.cardPlacement === "top-left" ? "checked" : ""} />
            <span>Top left</span>
          </label>
        </fieldset>
        <label class="field-label">
          Auto-close card after (seconds)
          <input
            name="autoDismissSeconds"
            type="number"
            min="0"
            max="30"
            step="1"
            value="${preferences.autoDismissSeconds}"
          />
        </label>
        <p class="muted-copy">Use 0 to keep the card open until you dismiss it. The timer pauses while you hover the card. After you move away, it closes in 2 seconds.</p>
        <fieldset class="settings-fieldset">
          <legend>Popup reviews</legend>
          <label class="field-label">
            Reviews to load
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
            <span>Compact previews (first 2 sentences)</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="popupReviewDisplayMode" value="full" ${preferences.popupReviewDisplayMode === "full" ? "checked" : ""} />
            <span>Full review text</span>
          </label>
        </fieldset>
        <p data-settings-status class="status-copy" hidden aria-live="polite"></p>
      </form>
    </section>
  `;

  const form = container.querySelector<HTMLFormElement>("[data-settings-form]");
  const statusElement = container.querySelector<HTMLParagraphElement>("[data-settings-status]");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  form?.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="number"]').forEach((input) => {
    input.addEventListener("change", () => {
      void persistSettings(form, statusElement);
    });
  });
}

function readPreferencesFromForm(form: HTMLFormElement): ExtensionUserPreferences {
  const formData = new FormData(form);

  return {
    autoDismissSeconds: Number(formData.get("autoDismissSeconds") ?? 3),
    cardPlacement: String(formData.get("cardPlacement") ?? "bottom-right") as CardPlacement,
    popupReviewDisplayMode: String(
      formData.get("popupReviewDisplayMode") ?? "compact"
    ) as PopupReviewDisplayMode,
    popupReviewsLimit: Number(formData.get("popupReviewsLimit") ?? 10)
  };
}

async function persistSettings(
  form: HTMLFormElement,
  statusElement: HTMLParagraphElement | null
): Promise<void> {
  await saveExtensionPreferences(readPreferencesFromForm(form));

  if (!statusElement) {
    return;
  }

  statusElement.hidden = false;
  statusElement.textContent = "Saved.";
  statusElement.classList.add("status-copy-success");
}
