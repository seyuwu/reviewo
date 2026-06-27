"use client";

import { FormEvent, useState } from "react";

import { login, register } from "../api/authenticate";
import { ApiError } from "../../../lib/api/api-error";
import type { AuthResponse, StoredAuthSession } from "../types/auth";

type AuthMode = "login" | "register";

interface MinimalAuthPanelProps {
  authSession: StoredAuthSession | null;
  contextLabel: string;
  onAuthSuccess: (authResponse: AuthResponse) => void;
  onSignOut: () => void;
}

export function MinimalAuthPanel({
  authSession,
  contextLabel,
  onAuthSuccess,
  onSignOut
}: MinimalAuthPanelProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmittingAuth(true);

    try {
      const authResponse =
        authMode === "register"
          ? await register({
              displayName: displayName.trim(),
              email: email.trim(),
              password
            })
          : await login({
              email: email.trim(),
              password
            });

      onAuthSuccess(authResponse);
    } catch (error) {
      setErrorMessage(readAuthErrorMessage(error, authMode));
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  function handleAuthModeChange(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setErrorMessage(null);
  }

  return (
    <form className="panel-card form-stack minimal-auth-panel" onSubmit={handleAuthSubmit}>
      <div className="section-heading">
        <p className="result-type">Account</p>
        <h2>{contextLabel}</h2>
      </div>

      <div
        key={authSession ? "signed-in" : "auth-form"}
        className="minimal-auth-panel-body ui-fade-in"
      >
        {authSession ? (
          <div className="signed-in-box">
            <p>Signed in as</p>
            <strong>{authSession.displayName}</strong>
            <span>{authSession.email}</span>
            <button type="button" className="secondary-button" onClick={onSignOut}>
              Use another account
            </button>
          </div>
        ) : (
          <div className="auth-form-body">
            <div className="segmented-control" aria-label="Authentication mode">
              <button
                type="button"
                aria-pressed={authMode === "register"}
                onClick={() => {
                  handleAuthModeChange("register");
                }}
              >
                Register
              </button>
              <button
                type="button"
                aria-pressed={authMode === "login"}
                onClick={() => {
                  handleAuthModeChange("login");
                }}
              >
                Login
              </button>
            </div>

            <div
              className={`auth-display-name-slot${authMode === "register" ? " is-visible" : ""}`}
              aria-hidden={authMode !== "register"}
            >
              <div className="auth-display-name-slot__inner">
                <label className="field-label">
                  Display name
                  <input
                    autoComplete="name"
                    maxLength={100}
                    minLength={1}
                    required={authMode === "register"}
                    tabIndex={authMode === "register" ? 0 : -1}
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                    }}
                  />
                </label>
              </div>
            </div>

            <label className="field-label">
              Email
              <input
                autoComplete="email"
                maxLength={320}
                required
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </label>

            <label className="field-label">
              Password
              <input
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                maxLength={128}
                minLength={8}
                required
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </label>

            <button type="submit" className="primary-button" disabled={isSubmittingAuth}>
              {isSubmittingAuth ? "Signing in..." : authMode === "register" ? "Register" : "Login"}
            </button>
          </div>
        )}
      </div>

      <div
        className={`form-feedback-slot${errorMessage ? " is-visible" : ""}`}
        aria-live="polite"
      >
        <div className="form-feedback-slot__inner">
          {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
        </div>
      </div>
    </form>
  );
}

function readAuthErrorMessage(error: unknown, authMode: AuthMode): string {
  if (error instanceof ApiError) {
    if (error.body && typeof error.body === "object" && "error" in error.body) {
      const apiError = (error.body as { error?: { message?: string } }).error;

      if (apiError?.message) {
        return apiError.message;
      }
    }

    if (error.status >= 500) {
      return "Reviewo API is temporarily unavailable. Try again in a moment.";
    }

    if (error.status === 409 && authMode === "register") {
      return "An account with this email already exists. Switch to Login.";
    }

    if (error.status === 401 && authMode === "login") {
      return "Invalid email or password.";
    }
  }

  return "Authentication failed. Check the entered data and try again.";
}
