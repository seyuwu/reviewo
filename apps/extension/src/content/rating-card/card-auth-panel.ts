import type { TranslateFn } from "@reviewo/i18n";

import {
  createAuthLoginMessage,
  createAuthRegisterMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export type CardAuthMode = "login" | "register";

export interface CardAuthPanelRenderOptions {
  authMode: CardAuthMode;
  pendingScore: number | null;
}

export function renderCardAuthPanelMarkup(
  t: TranslateFn,
  options: CardAuthPanelRenderOptions
): string {
  const pendingCopy =
    options.pendingScore === null
      ? t("card.auth.leadDefault")
      : t("card.auth.leadPendingScore", { score: options.pendingScore });

  return `
    <section class="reviewo-auth-panel">
      <p class="reviewo-auth-lead">${escapeHtmlText(pendingCopy)}</p>
      <div class="reviewo-auth-mode-toggle" role="group" aria-label="${escapeHtmlAttribute(t("auth.mode.ariaLabel"))}">
        <button
          type="button"
          class="reviewo-auth-mode-button${options.authMode === "register" ? " is-active" : ""}"
          data-auth-mode="register"
          aria-pressed="${options.authMode === "register"}"
        >${escapeHtmlText(t("auth.mode.register"))}</button>
        <button
          type="button"
          class="reviewo-auth-mode-button${options.authMode === "login" ? " is-active" : ""}"
          data-auth-mode="login"
          aria-pressed="${options.authMode === "login"}"
        >${escapeHtmlText(t("auth.mode.login"))}</button>
      </div>
      <form class="reviewo-auth-form" data-auth-form>
        <div class="reviewo-auth-display-name-slot${options.authMode === "register" ? " is-visible" : ""}" data-auth-display-name-slot>
          <label class="reviewo-auth-field">
            <span class="reviewo-auth-field-label">${escapeHtmlText(t("auth.field.displayName"))}</span>
            <input
              name="displayName"
              autocomplete="name"
              maxlength="100"
              minlength="1"
              ${options.authMode === "register" ? "required" : 'tabindex="-1"'}
            />
          </label>
        </div>
        <label class="reviewo-auth-field">
          <span class="reviewo-auth-field-label">${escapeHtmlText(t("auth.field.email"))}</span>
          <input name="email" type="email" autocomplete="email" maxlength="320" required />
        </label>
        <label class="reviewo-auth-field">
          <span class="reviewo-auth-field-label">${escapeHtmlText(t("auth.field.password"))}</span>
          <input
            name="password"
            type="password"
            autocomplete="${options.authMode === "register" ? "new-password" : "current-password"}"
            maxlength="128"
            minlength="8"
            required
          />
        </label>
        <button type="submit" class="reviewo-auth-submit" data-auth-submit>
          ${escapeHtmlText(options.authMode === "register" ? t("auth.mode.register") : t("auth.mode.login"))}
        </button>
      </form>
      <p class="reviewo-auth-status" data-auth-status hidden></p>
    </section>
  `;
}

export function bindCardAuthPanel(
  cardElement: HTMLElement,
  t: TranslateFn,
  options: {
    authMode: CardAuthMode;
    onAuthModeChange: (mode: CardAuthMode) => void;
    onCancel: () => void;
    onSuccess: () => void | Promise<void>;
  }
): void {
  let isSubmitting = false;

  cardElement.querySelector("[data-auth-back]")?.addEventListener("click", () => {
    options.onCancel();
  });

  cardElement.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      options.onAuthModeChange(button.dataset.authMode === "register" ? "register" : "login");
    });
  });

  cardElement.querySelector("[data-auth-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAuthForm(event.target as HTMLFormElement);
  });

  function setAuthMode(nextMode: CardAuthMode): void {
    setStatus("");

    cardElement.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
      const isActive = button.dataset.authMode === nextMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    const displayNameSlot = cardElement.querySelector<HTMLElement>("[data-auth-display-name-slot]");
    const displayNameInput = cardElement.querySelector<HTMLInputElement>('input[name="displayName"]');
    const passwordInput = cardElement.querySelector<HTMLInputElement>('input[name="password"]');
    const submitButton = cardElement.querySelector<HTMLButtonElement>("[data-auth-submit]");

    if (displayNameSlot) {
      displayNameSlot.classList.toggle("is-visible", nextMode === "register");
    }

    if (displayNameInput) {
      displayNameInput.required = nextMode === "register";
      displayNameInput.tabIndex = nextMode === "register" ? 0 : -1;
    }

    if (passwordInput) {
      passwordInput.autocomplete = nextMode === "register" ? "new-password" : "current-password";
    }

    if (submitButton) {
      submitButton.textContent =
        nextMode === "register" ? t("auth.mode.register") : t("auth.mode.login");
    }
  }

  function setStatus(message: string, tone: "default" | "error" | "success" = "default"): void {
    const statusElement = cardElement.querySelector<HTMLParagraphElement>("[data-auth-status]");

    if (!statusElement) {
      return;
    }

    statusElement.hidden = !message;
    statusElement.textContent = message;
    statusElement.classList.remove("is-error", "is-success");

    if (tone === "error") {
      statusElement.classList.add("is-error");
    }

    if (tone === "success") {
      statusElement.classList.add("is-success");
    }
  }

  async function submitAuthForm(form: HTMLFormElement): Promise<void> {
    if (isSubmitting) {
      return;
    }

    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    const authMode = options.authMode;
    const submitButton = form.querySelector<HTMLButtonElement>("[data-auth-submit]");

    isSubmitting = true;
    setStatus("");

    if (submitButton) {
      submitButton.disabled = true;
    }

    const response = await sendExtensionMessage(
      authMode === "register"
        ? createAuthRegisterMessage(displayName, email, password)
        : createAuthLoginMessage(email, password)
    );

    isSubmitting = false;

    if (submitButton) {
      submitButton.disabled = false;
    }

    if (!response) {
      setStatus(t("card.auth.error.unreachable"), "error");
      return;
    }

    if (response.type === ExtensionMessageType.AuthOperationSuccess) {
      setStatus(t("card.auth.success.savingRating"), "success");
      await options.onSuccess();
      return;
    }

    if (response.type === ExtensionMessageType.AuthOperationError) {
      const apiMessage = response.payload?.message?.trim();

      if (apiMessage?.toLowerCase().includes("already exists")) {
        setStatus(t("card.auth.error.emailExists"), "error");
        return;
      }

      setStatus(apiMessage || t("auth.error.generic"), "error");
      return;
    }

    setStatus(t("auth.error.generic"), "error");
  }

  setAuthMode(options.authMode);
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}
