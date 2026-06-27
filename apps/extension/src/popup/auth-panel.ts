import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import {
  createAuthLoginMessage,
  createAuthRegisterMessage,
  createAuthSignOutMessage,
  createAuthenticatedApiRequestMessage,
  createGetAuthSessionMessage,
  ExtensionMessageType
} from "../shared/messages.js";

type AuthMode = "login" | "register";

export function mountAuthPanel(root: HTMLElement): void {
  let authMode: AuthMode = "register";
  let authSession: ExtensionStoredAuthSession | null = null;
  let isSubmitting = false;

  root.innerHTML = `
    <section class="auth-panel">
      <div class="section-heading">
        <p class="section-eyebrow">Account</p>
        <h2 class="section-title">Sign in to Reviewo</h2>
      </div>
      <div id="auth-content"></div>
      <p id="auth-status" class="status-copy" hidden></p>
    </section>
  `;

  const authContentElement = root.querySelector<HTMLDivElement>("#auth-content");
  const authStatusElement = root.querySelector<HTMLParagraphElement>("#auth-status");

  if (!authContentElement || !authStatusElement) {
    return;
  }

  const authStatus = authStatusElement;

  function setAuthStatus(message: string, tone: "default" | "success" | "error" = "default"): void {
    authStatus.hidden = !message;
    authStatus.textContent = message;
    authStatus.classList.remove("status-copy-success", "status-copy-error");

    if (tone === "success") {
      authStatus.classList.add("status-copy-success");
    }

    if (tone === "error") {
      authStatus.classList.add("status-copy-error");
    }
  }

  function renderAuthPanel(): void {
    if (!authContentElement) {
      return;
    }

    if (authSession) {
      authContentElement.innerHTML = `
        <div class="signed-in-box">
          <p>Signed in as</p>
          <strong>${escapeHtml(authSession.displayName)}</strong>
          <span>${escapeHtml(authSession.email ?? "No email")}</span>
          <button type="button" class="secondary-button" id="verify-session-button">Verify session</button>
          <button type="button" class="secondary-button" id="sign-out-button">Use another account</button>
        </div>
      `;

      authContentElement.querySelector("#verify-session-button")?.addEventListener("click", () => {
        void verifySession();
      });

      authContentElement.querySelector("#sign-out-button")?.addEventListener("click", () => {
        void signOut();
      });

      return;
    }

    authContentElement.innerHTML = `
      <div class="segmented-control" role="group" aria-label="Authentication mode">
        <button type="button" data-auth-mode="register" aria-pressed="${authMode === "register"}">Register</button>
        <button type="button" data-auth-mode="login" aria-pressed="${authMode === "login"}">Login</button>
      </div>
      <form id="auth-form" class="form-stack">
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
        <button type="submit" class="primary-button" id="auth-submit-button">
          ${authMode === "register" ? "Register" : "Login"}
        </button>
      </form>
    `;

    authContentElement.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        authMode = button.dataset.authMode === "login" ? "login" : "register";
        setAuthStatus("");
        renderAuthPanel();
      });
    });

    authContentElement.querySelector("#auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitAuthForm(event.target as HTMLFormElement);
    });
  }

  async function loadAuthSession(): Promise<void> {
    const response = await sendExtensionMessage(createGetAuthSessionMessage());

    if (response?.type === ExtensionMessageType.AuthSessionResult) {
      authSession = response.payload?.session ?? null;
      renderAuthPanel();
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
    const submitButton = form.querySelector<HTMLButtonElement>("#auth-submit-button");

    isSubmitting = true;
    setAuthStatus("");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Signing in...";
    }

    const response = await sendExtensionMessage(
      authMode === "register"
        ? createAuthRegisterMessage(displayName, email, password)
        : createAuthLoginMessage(email, password)
    );

    isSubmitting = false;

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = authMode === "register" ? "Register" : "Login";
    }

    if (response?.type === ExtensionMessageType.AuthOperationSuccess) {
      authSession = response.payload?.session ?? null;
      setAuthStatus("Signed in successfully.", "success");
      renderAuthPanel();
      return;
    }

    if (response?.type === ExtensionMessageType.AuthOperationError) {
      setAuthStatus("Authentication failed. Check the entered data and try again.", "error");
      return;
    }

    setAuthStatus("Authentication failed unexpectedly.", "error");
  }

  async function signOut(): Promise<void> {
    const response = await sendExtensionMessage(createAuthSignOutMessage());

    if (response?.type === ExtensionMessageType.AuthSessionResult) {
      authSession = null;
      setAuthStatus("");
      renderAuthPanel();
    }
  }

  async function verifySession(): Promise<void> {
    setAuthStatus("Verifying session...");

    const response = await sendExtensionMessage(
      createAuthenticatedApiRequestMessage("/auth/me", "GET")
    );

    if (response?.type === ExtensionMessageType.AuthenticatedApiResult) {
      const currentUser = response.payload?.data as { displayName?: string } | undefined;

      setAuthStatus(
        `Session verified for ${currentUser?.displayName ?? "current user"}.`,
        "success"
      );
      return;
    }

    if (response?.type === ExtensionMessageType.AuthenticatedApiError) {
      authSession = null;
      renderAuthPanel();
      setAuthStatus("Session expired. Sign in again.", "error");
      return;
    }

    setAuthStatus("Could not verify session.", "error");
  }

  void loadAuthSession();
}

interface ExtensionRuntimeResponse {
  payload?: {
    data?: unknown;
    message?: string;
    session?: ExtensionStoredAuthSession | null;
  };
  type?: string;
}

function sendExtensionMessage(message: unknown): Promise<ExtensionRuntimeResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response);
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
