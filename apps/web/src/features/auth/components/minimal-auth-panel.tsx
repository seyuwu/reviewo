"use client";

import { FormEvent, useState } from "react";

import { login, register } from "../api/authenticate";
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
  const [authMode, setAuthMode] = useState<AuthMode>("register");
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
    } catch {
      setErrorMessage("Authentication failed. Check the entered data and try again.");
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  return (
    <form className="panel-card form-stack" onSubmit={handleAuthSubmit}>
      <div className="section-heading">
        <p className="result-type">Account</p>
        <h2>{contextLabel}</h2>
      </div>

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
        <>
          <div className="segmented-control" aria-label="Authentication mode">
            <button
              type="button"
              aria-pressed={authMode === "register"}
              onClick={() => {
                setAuthMode("register");
              }}
            >
              Register
            </button>
            <button
              type="button"
              aria-pressed={authMode === "login"}
              onClick={() => {
                setAuthMode("login");
              }}
            >
              Login
            </button>
          </div>

          {authMode === "register" ? (
            <label className="field-label">
              Display name
              <input
                autoComplete="name"
                maxLength={100}
                minLength={1}
                required
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                }}
              />
            </label>
          ) : null}

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
        </>
      )}

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
    </form>
  );
}
