import type { TranslateFn } from "@reviewo/i18n";

import type { ExtensionStoredAuthSession } from "../../shared/types/auth.js";
import { extensionConfig } from "../../shared/config.js";
import {
  createAuthLoginMessage,
  createAuthRegisterMessage,
  createAuthSignOutMessage,
  createGetAuthSessionMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import { sendExtensionMessage } from "../services/popup-messaging.js";

type AuthMode = "login" | "register";

export interface AuthFormOptions {
  onSessionChange: (session: ExtensionStoredAuthSession | null) => void;
  root: HTMLElement;
  t: TranslateFn;
}

export function mountAuthForm(options: AuthFormOptions): { refresh: () => Promise<void> } {
  let authMode: AuthMode = "login";
  let authSession: ExtensionStoredAuthSession | null = null;
  let isSubmitting = false;
  let hasRendered = false;
  const { t } = options;

  async function loadAuthSession(): Promise<void> {
    const response = await sendExtensionMessage<{
      payload?: { session?: ExtensionStoredAuthSession | null };
      type?: string;
    }>(createGetAuthSessionMessage());

    if (response?.type === ExtensionMessageType.AuthSessionResult) {
      authSession = response.payload?.session ?? null;
      render();

      if (authSession) {
        options.onSessionChange(authSession);
      }
    }
  }

  function setStatus(message: string, tone: "default" | "error" | "success" = "default"): void {
    const statusElement = options.root.querySelector<HTMLParagraphElement>("[data-auth-status]");

    if (!statusElement) {
      return;
    }

    statusElement.hidden = !message;
    statusElement.textContent = message;
    statusElement.classList.toggle("status-copy-success", tone === "success");
    statusElement.classList.toggle("status-copy-error", tone === "error");
    options.root
      .querySelector<HTMLElement>("[data-auth-feedback-slot]")
      ?.classList.toggle("is-visible", Boolean(message));
  }

  function setAuthMode(nextMode: AuthMode): void {
    authMode = nextMode;
    setStatus("");

    options.root.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
      const isActive = button.dataset.authMode === authMode;
      button.setAttribute("aria-pressed", String(isActive));
    });

    const displayNameSlot = options.root.querySelector<HTMLElement>("[data-auth-display-name-slot]");
    const displayNameInput = options.root.querySelector<HTMLInputElement>('input[name="displayName"]');

    if (displayNameSlot) {
      displayNameSlot.classList.toggle("is-visible", authMode === "register");
      displayNameSlot.setAttribute("aria-hidden", String(authMode !== "register"));
    }

    if (displayNameInput) {
      displayNameInput.required = authMode === "register";
      displayNameInput.tabIndex = authMode === "register" ? 0 : -1;
    }

    const submitButton = options.root.querySelector<HTMLButtonElement>("[data-auth-submit]");

    if (submitButton) {
      submitButton.textContent =
        authMode === "register" ? t("auth.mode.register") : t("auth.mode.login");
    }
  }

  function render(): void {
    if (authSession) {
      options.root.innerHTML = `
        <div class="auth-inline signed-in-inline ui-fade-soft">
          <p>${escapeHtml(t("auth.signedInAs", { displayName: authSession.displayName }))}</p>
        </div>
      `;
      hasRendered = false;
      return;
    }

    if (!hasRendered) {
      options.root.innerHTML = `
        <div class="auth-inline">
          <div class="segmented-control" role="group" aria-label="${escapeHtml(t("auth.mode.ariaLabel"))}">
            <button type="button" data-auth-mode="register" aria-pressed="${authMode === "register"}">${escapeHtml(t("auth.mode.register"))}</button>
            <button type="button" data-auth-mode="login" aria-pressed="${authMode === "login"}">${escapeHtml(t("auth.mode.login"))}</button>
          </div>
          <form data-auth-form class="form-stack">
            <div class="auth-display-name-slot${authMode === "register" ? " is-visible" : ""}" data-auth-display-name-slot aria-hidden="${authMode !== "register"}">
              <div class="auth-display-name-slot__inner">
                <label class="field-label">
                  ${escapeHtml(t("auth.field.displayName"))}
                  <input name="displayName" autocomplete="name" maxlength="100" minlength="1" ${authMode === "register" ? "required" : 'tabindex="-1"'} />
                </label>
              </div>
            </div>
            <label class="field-label">
              ${escapeHtml(t("auth.field.email"))}
              <input name="email" type="email" autocomplete="email" maxlength="320" required />
            </label>
            <label class="field-label">
              ${escapeHtml(t("auth.field.password"))}
              <input
                name="password"
                type="password"
                autocomplete="${authMode === "register" ? "new-password" : "current-password"}"
                maxlength="128"
                minlength="8"
                required
              />
            </label>
            <button type="submit" class="primary-button" data-auth-submit>${escapeHtml(authMode === "register" ? t("auth.mode.register") : t("auth.mode.login"))}</button>
          </form>
          <p class="muted-copy auth-hint">
            ${escapeHtml(t("auth.hint.separateSession"))}
          </p>
          <div class="form-feedback-slot" data-auth-feedback-slot>
            <div class="form-feedback-slot__inner">
              <p data-auth-status class="status-copy" hidden></p>
            </div>
          </div>
        </div>
      `;
      hasRendered = true;

      options.root.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          setAuthMode(button.dataset.authMode === "login" ? "login" : "register");
        });
      });

      options.root.querySelector("[data-auth-form]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitAuthForm(event.target as HTMLFormElement);
      });
      return;
    }

    setAuthMode(authMode);
  }

  async function submitAuthForm(form: HTMLFormElement): Promise<void> {
    if (isSubmitting) {
      return;
    }

    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    isSubmitting = true;
    setStatus("");

    if (submitButton) {
      submitButton.disabled = true;
    }

    const response = await sendExtensionMessage<{
      payload?: { message?: string; session?: ExtensionStoredAuthSession };
      type?: string;
    }>(
      authMode === "register"
        ? createAuthRegisterMessage(displayName, email, password)
        : createAuthLoginMessage(email, password)
    );

    isSubmitting = false;

    if (submitButton) {
      submitButton.disabled = false;
    }

    if (!response) {
      setStatus(t("auth.error.backgroundUnavailable", { apiUrl: extensionConfig.apiBaseUrl }), "error");
      return;
    }

    if (response?.type === ExtensionMessageType.AuthOperationSuccess) {
      authSession = response.payload?.session ?? null;
      options.onSessionChange(authSession);
      setStatus(t("auth.success.signedIn"), "success");
      render();
      return;
    }

    if (response?.type === ExtensionMessageType.AuthOperationError) {
      const apiMessage = response.payload?.message?.trim();

      if (apiMessage?.toLowerCase().includes("already exists")) {
        setStatus(t("auth.error.emailExists"), "error");
        return;
      }

      setStatus(apiMessage || t("auth.error.generic"), "error");
      return;
    }

    setStatus(t("auth.error.generic"), "error");
  }

  void loadAuthSession();

  return {
    refresh: loadAuthSession
  };
}

export async function signOutCurrentUser(): Promise<void> {
  await sendExtensionMessage(createAuthSignOutMessage());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
