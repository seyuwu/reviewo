import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import { escapeHtml, formatAccountLabel } from "./view-helpers.js";

export interface PopupShellElements {
  accountButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  body: HTMLElement;
  footer: HTMLElement;
  header: HTMLElement;
  logoutButton: HTMLButtonElement;
  settingsButton: HTMLButtonElement;
}

export function createPopupShell(root: HTMLElement): PopupShellElements {
  root.innerHTML = `
    <div class="popup-app">
      <header class="popup-header">
        <div class="popup-header-main">
          <button type="button" class="icon-button" data-back-button hidden aria-label="Back">←</button>
          <div class="popup-brand">
            <span class="popup-logo">Reviewo</span>
          </div>
          <button type="button" class="account-button" data-account-button>Sign in</button>
        </div>
      </header>
      <main class="popup-body" data-popup-body></main>
      <footer class="popup-footer">
        <button type="button" class="footer-button" data-settings-button>Settings</button>
        <button type="button" class="footer-button" data-logout-button hidden>Logout</button>
      </footer>
    </div>
  `;

  const accountButton = root.querySelector<HTMLButtonElement>("[data-account-button]");
  const backButton = root.querySelector<HTMLButtonElement>("[data-back-button]");
  const body = root.querySelector<HTMLElement>("[data-popup-body]");
  const footer = root.querySelector<HTMLElement>(".popup-footer");
  const header = root.querySelector<HTMLElement>(".popup-header");
  const logoutButton = root.querySelector<HTMLButtonElement>("[data-logout-button]");
  const settingsButton = root.querySelector<HTMLButtonElement>("[data-settings-button]");

  if (
    !accountButton ||
    !backButton ||
    !body ||
    !footer ||
    !header ||
    !logoutButton ||
    !settingsButton
  ) {
    throw new Error("Popup shell could not be initialized.");
  }

  return {
    accountButton,
    backButton,
    body,
    footer,
    header,
    logoutButton,
    settingsButton
  };
}

export function updateShellChrome(
  elements: PopupShellElements,
  options: {
    canGoBack: boolean;
    isSessionLoaded?: boolean;
    onAccountClick?: () => void;
    session: ExtensionStoredAuthSession | null;
    showAuthPrompt: boolean;
  }
): void {
  elements.backButton.hidden = !options.canGoBack;
  elements.accountButton.textContent = options.isSessionLoaded
    ? formatAccountLabel(options.session)
    : "…";
  elements.logoutButton.hidden = !options.session;
  elements.accountButton.hidden = Boolean(options.session && !options.showAuthPrompt);
}

export function renderAuthPromptSlot(
  container: HTMLElement,
  session: ExtensionStoredAuthSession | null
): HTMLElement {
  const slot = document.createElement("section");
  slot.className = "auth-prompt-slot";
  slot.hidden = Boolean(session);
  container.prepend(slot);
  return slot;
}

export function renderScreenHeading(title: string, subtitle?: string): string {
  return `
    <div class="screen-heading">
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </div>
  `;
}
