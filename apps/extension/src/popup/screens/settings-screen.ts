import {
  readExtensionPreferences,
  saveExtensionPreferences
} from "../../shared/extension-preferences-storage.js";
import type { CardDisplayTarget } from "../../shared/preferences.js";
import { extensionConfig } from "../../shared/config.js";
import { escapeHtml } from "../view-helpers.js";

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
          <legend>Popup & card focus</legend>
          <label class="settings-radio">
            <input type="radio" name="cardDisplayTarget" value="current" ${preferences.cardDisplayTarget === "current" ? "checked" : ""} />
            <span>Current page only</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardDisplayTarget" value="parent" ${preferences.cardDisplayTarget === "parent" ? "checked" : ""} />
            <span>Parent website only</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="cardDisplayTarget" value="both" ${preferences.cardDisplayTarget === "both" ? "checked" : ""} />
            <span>Both (current page + parent site)</span>
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
        <p class="muted-copy">Use 0 to keep the card open until you dismiss it. Timer pauses while you hover the card.</p>
        <button type="submit" class="primary-button">Save settings</button>
        <p data-settings-status class="status-copy" hidden></p>
      </form>
      <dl class="settings-list">
        <div>
          <dt>Accounts</dt>
          <dd>Signing in on the Reviewo web app syncs into the extension when you have a localhost:3001 tab open. You can still sign in here directly.</dd>
        </div>
        <div>
          <dt>API</dt>
          <dd>${escapeHtml(extensionConfig.apiBaseUrl)}</dd>
        </div>
        <div>
          <dt>Web app</dt>
          <dd>${escapeHtml(extensionConfig.webBaseUrl)}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>0.0.1 (RFC 0009 phase 1)</dd>
        </div>
      </dl>
      <a class="secondary-button link-button" href="${escapeHtml(extensionConfig.webBaseUrl)}" target="_blank" rel="noopener noreferrer">
        Open Reviewo web
      </a>
    </section>
  `;

  const form = container.querySelector<HTMLFormElement>("[data-settings-form]");
  const statusElement = container.querySelector<HTMLParagraphElement>("[data-settings-status]");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const formData = new FormData(form);
      const cardDisplayTarget = String(formData.get("cardDisplayTarget") ?? "both") as CardDisplayTarget;
      const autoDismissSeconds = Number(formData.get("autoDismissSeconds") ?? 3);

      await saveExtensionPreferences({
        autoDismissSeconds,
        cardDisplayTarget
      });

      if (statusElement) {
        statusElement.hidden = false;
        statusElement.textContent = "Settings saved.";
        statusElement.classList.add("status-copy-success");
      }
    })();
  });
}
