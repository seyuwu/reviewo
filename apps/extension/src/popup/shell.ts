import type { TranslateFn } from "@reviewo/i18n";

import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import { escapeHtml, formatAccountLabel } from "./view-helpers.js";

export interface PopupShellElements {
  accountButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  body: HTMLElement;
  footer: HTMLElement;
  header: HTMLElement;
  localeMount: HTMLElement;
  logoutButton: HTMLButtonElement;
  openEntityLink: HTMLAnchorElement;
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
        <div class="popup-footer-center">
          <div data-popup-locale-mount></div>
          <a
            class="footer-button footer-entity-link"
            data-open-entity-link
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            hidden
          >Open page</a>
        </div>
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
  const openEntityLink = root.querySelector<HTMLAnchorElement>("[data-open-entity-link]");
  const settingsButton = root.querySelector<HTMLButtonElement>("[data-settings-button]");
  const localeMount = root.querySelector<HTMLElement>("[data-popup-locale-mount]");

  if (
    !accountButton ||
    !backButton ||
    !body ||
    !footer ||
    !header ||
    !localeMount ||
    !logoutButton ||
    !openEntityLink ||
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
    localeMount,
    logoutButton,
    openEntityLink,
    settingsButton
  };
}

export function applyPopupShellLabels(elements: PopupShellElements, t: TranslateFn): void {
  elements.backButton.setAttribute("aria-label", t("popup.shell.backAriaLabel"));
  elements.settingsButton.textContent = t("popup.shell.settings");
  elements.openEntityLink.textContent = t("popup.shell.openPage");
  elements.logoutButton.textContent = t("popup.shell.logout");
}

export function updateShellChrome(
  elements: PopupShellElements,
  t: TranslateFn,
  options: {
    canGoBack: boolean;
    isSessionLoaded?: boolean;
    onAccountClick?: () => void;
    session: ExtensionStoredAuthSession | null;
    showAuthPrompt: boolean;
  }
): void {
  elements.backButton.hidden = !options.canGoBack;
  elements.logoutButton.hidden = !options.session;
  elements.accountButton.hidden = Boolean(options.session && !options.showAuthPrompt);

  if (options.session) {
    elements.accountButton.textContent = options.isSessionLoaded
      ? formatAccountLabel(options.session)
      : t("common.loadingEllipsis");
    elements.accountButton.setAttribute("aria-expanded", "false");
    return;
  }

  elements.accountButton.textContent = options.showAuthPrompt
    ? t("popup.shell.close")
    : t("popup.shell.signIn");
  elements.accountButton.setAttribute("aria-expanded", String(options.showAuthPrompt));
}

export function updateFooterEntityLink(
  elements: PopupShellElements,
  entityPageUrl: string | null
): void {
  if (!entityPageUrl) {
    elements.openEntityLink.hidden = true;
    elements.openEntityLink.removeAttribute("href");
    return;
  }

  elements.openEntityLink.hidden = false;
  elements.openEntityLink.href = entityPageUrl;
}

export function ensureAuthPromptSlot(container: HTMLElement): HTMLElement {
  const existingMount = container.querySelector<HTMLElement>("[data-auth-prompt-mount]");

  if (existingMount) {
    return existingMount;
  }

  const slot = document.createElement("section");
  slot.className = "auth-prompt-slot";
  slot.setAttribute("aria-hidden", "true");

  const mount = document.createElement("div");
  mount.className = "auth-prompt-mount";
  mount.dataset.authPromptMount = "true";
  slot.append(mount);
  container.prepend(slot);

  return mount;
}

export function setAuthPromptVisible(container: HTMLElement, isVisible: boolean): void {
  const slot = container.querySelector<HTMLElement>(".auth-prompt-slot");

  if (!slot) {
    return;
  }

  slot.classList.toggle("is-visible", isVisible);
  slot.setAttribute("aria-hidden", String(!isVisible));
}

export function renderScreenHeading(title: string, subtitle?: string): string {
  return `
    <div class="screen-heading">
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </div>
  `;
}
