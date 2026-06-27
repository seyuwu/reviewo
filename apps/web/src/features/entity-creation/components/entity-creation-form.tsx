"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { createEntity } from "../api/create-entity";
import { entityTypes } from "../types/entity";
import type { EntityType } from "../types/entity";

export function EntityCreationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query") ?? "";
  const { authSession, signOut, storeAuthSession } = useAuthSession();
  const [title, setTitle] = useState(initialQuery);
  const [type, setType] = useState<EntityType>("website");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [description, setDescription] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingEntity, setIsCreatingEntity] = useState(false);

  const canSubmitEntity = useMemo(
    () => Boolean(authSession?.accessToken && title.trim() && type),
    [authSession?.accessToken, title, type]
  );

  async function handleCreateEntitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!authSession?.accessToken) {
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
        authSession.accessToken
      );

      router.push(
        initialQuery.trim()
          ? `/entities/${entity.id}?q=${encodeURIComponent(initialQuery.trim())}`
          : `/entities/${entity.id}`
      );
    } catch {
      setErrorMessage("Entity creation failed. Check the form and try again.");
    } finally {
      setIsCreatingEntity(false);
    }
  }

  function handleSignOut() {
    signOut();
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
        <MinimalAuthPanel
          authSession={authSession}
          contextLabel="Sign in for creation"
          onAuthSuccess={(authResponse) => {
            const storedSession = storeAuthSession(authResponse);
            setStatusMessage(`Signed in as ${storedSession.displayName}.`);
          }}
          onSignOut={handleSignOut}
        />

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
