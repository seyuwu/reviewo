"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { login, register } from "../api/authenticate";
import { createEntity } from "../api/create-entity";
import type { AuthResponse } from "../types/auth";
import { entityTypes } from "../types/entity";
import type { EntityType } from "../types/entity";

const AUTH_STORAGE_KEY = "reviewo.creationAuth";

type AuthMode = "login" | "register";

interface StoredAuthState {
  accessToken: string;
  displayName: string;
  email: string | null;
}

export function EntityCreationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query") ?? "";
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [authState, setAuthState] = useState<StoredAuthState | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState(initialQuery);
  const [type, setType] = useState<EntityType>("website");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [description, setDescription] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isCreatingEntity, setIsCreatingEntity] = useState(false);

  const canSubmitEntity = useMemo(
    () => Boolean(authState?.accessToken && title.trim() && type),
    [authState?.accessToken, title, type]
  );

  useEffect(() => {
    const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (!storedAuth) {
      return;
    }

    try {
      setAuthState(JSON.parse(storedAuth) as StoredAuthState);
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
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
      const storedAuth = toStoredAuthState(authResponse);

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedAuth));
      setAuthState(storedAuth);
      setStatusMessage(`Signed in as ${storedAuth.displayName}.`);
    } catch {
      setErrorMessage("Authentication failed. Check the entered data and try again.");
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleCreateEntitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!authState?.accessToken) {
      setErrorMessage("Sign in before creating an entity.");
      return;
    }

    setIsCreatingEntity(true);

    try {
      const entity = await createEntity(
        {
          canonicalUrl: canonicalUrl.trim(),
          description: description.trim(),
          title: title.trim(),
          type
        },
        authState.accessToken
      );

      router.push(`/entities/${entity.id}`);
    } catch {
      setErrorMessage("Entity creation failed. Check the form and try again.");
    } finally {
      setIsCreatingEntity(false);
    }
  }

  function handleSignOut() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthState(null);
    setStatusMessage("Signed out from the creation flow.");
  }

  return (
    <section className="creation-card" aria-labelledby="entity-creation-heading">
      <p className="eyebrow">Create entity</p>
      <h1 id="entity-creation-heading">Add a page to Reviewo.</h1>
      <p className="hero-copy">
        Create the minimum entity record. The backend remains responsible for validation, canonical
        URL normalization, and duplicate prevention.
      </p>

      <div className="creation-grid">
        <form className="panel-card form-stack" onSubmit={handleAuthSubmit}>
          <div className="section-heading">
            <p className="result-type">Step 1</p>
            <h2>Sign in for creation</h2>
          </div>

          {authState ? (
            <div className="signed-in-box">
              <p>Signed in as</p>
              <strong>{authState.displayName}</strong>
              <span>{authState.email}</span>
              <button type="button" className="secondary-button" onClick={handleSignOut}>
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
                {isSubmittingAuth
                  ? "Signing in..."
                  : authMode === "register"
                    ? "Register"
                    : "Login"}
              </button>
            </>
          )}
        </form>

        <form className="panel-card form-stack" onSubmit={handleCreateEntitySubmit}>
          <div className="section-heading">
            <p className="result-type">Step 2</p>
            <h2>Entity details</h2>
          </div>

          <label className="field-label">
            Title
            <input
              maxLength={200}
              minLength={1}
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </label>

          <label className="field-label">
            Type
            <select
              required
              value={type}
              onChange={(event) => {
                setType(event.target.value as EntityType);
              }}
            >
              {entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Canonical URL
            <input
              maxLength={2048}
              placeholder="https://example.com"
              type="url"
              value={canonicalUrl}
              onChange={(event) => {
                setCanonicalUrl(event.target.value);
              }}
            />
          </label>

          <label className="field-label">
            Description
            <textarea
              maxLength={2000}
              rows={5}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={!canSubmitEntity || isCreatingEntity}
          >
            {isCreatingEntity ? "Creating..." : "Create entity"}
          </button>
        </form>
      </div>

      <div className="form-feedback" aria-live="polite">
        {statusMessage ? <p className="success-message">{statusMessage}</p> : null}
        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
      </div>
    </section>
  );
}

function toStoredAuthState(authResponse: AuthResponse): StoredAuthState {
  return {
    accessToken: authResponse.accessToken,
    displayName: authResponse.user.displayName,
    email: authResponse.user.email
  };
}
