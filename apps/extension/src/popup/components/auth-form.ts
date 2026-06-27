import type { ExtensionStoredAuthSession } from "../../shared/types/auth.js";
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
}

export function mountAuthForm(options: AuthFormOptions): { refresh: () => Promise<void> } {
  let authMode: AuthMode = "login";
  let authSession: ExtensionStoredAuthSession | null = null;
  let isSubmitting = false;

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
  }

  function render(): void {
    if (authSession) {
      options.root.innerHTML = `
        <div class="auth-inline signed-in-inline">
          <p>Signed in as <strong>${escapeHtml(authSession.displayName)}</strong></p>
        </div>
      `;
      return;
    }

    options.root.innerHTML = `
      <div class="auth-inline">
        <div class="segmented-control" role="group" aria-label="Authentication mode">
          <button type="button" data-auth-mode="register" aria-pressed="${authMode === "register"}">Register</button>
          <button type="button" data-auth-mode="login" aria-pressed="${authMode === "login"}">Login</button>
        </div>
        <form data-auth-form class="form-stack">
          ${
            authMode === "register"
              ? `
            <label class="field-label">
              Display name
              <input name="displayName" autocomplete="name" maxlength="100" minlength="1" required />
            </label>
          `
              : ""
          }
          <label class="field-label">
            Email
            <input name="email" type="email" autocomplete="email" maxlength="320" required />
          </label>
          <label class="field-label">
            Password
            <input
              name="password"
              type="password"
              autocomplete="${authMode === "register" ? "new-password" : "current-password"}"
              maxlength="128"
              minlength="8"
              required
            />
          </label>
          <button type="submit" class="primary-button">${authMode === "register" ? "Register" : "Login"}</button>
        </form>
        <p class="muted-copy auth-hint">
          Extension sign-in is stored separately from the web app. Use the same email and password, or register here once.
        </p>
        <p data-auth-status class="status-copy" hidden></p>
      </div>
    `;

    options.root.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        authMode = button.dataset.authMode === "login" ? "login" : "register";
        setStatus("");
        render();
      });
    });

    options.root.querySelector("[data-auth-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitAuthForm(event.target as HTMLFormElement);
    });
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
      setStatus(
        "Could not reach the extension background worker. Reload the extension on chrome://extensions and make sure the API is running on http://localhost:3000.",
        "error"
      );
      return;
    }

    if (response?.type === ExtensionMessageType.AuthOperationSuccess) {
      authSession = response.payload?.session ?? null;
      options.onSessionChange(authSession);
      setStatus("Signed in successfully.", "success");
      render();
      return;
    }

    if (response?.type === ExtensionMessageType.AuthOperationError) {
      const apiMessage = response.payload?.message?.trim();

      if (apiMessage?.toLowerCase().includes("already exists")) {
        setStatus("This email is already registered. Switch to Login and use the same password.", "error");
        return;
      }

      setStatus(apiMessage || "Authentication failed. Check your details and try again.", "error");
      return;
    }

    setStatus("Authentication failed. Check your details and try again.", "error");
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
