"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { formatEntityTypeLabel } from "../../i18n/entity-type-label";
import { createEntity } from "../api/create-entity";
import { entityTypes } from "../types/entity";
import type { EntityType } from "../types/entity";

export function EntityCreationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query") ?? "";
  const t = useTranslation();
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
      setErrorMessage(t("web.entityCreate.signInRequired"));
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
      setErrorMessage(t("web.entityCreate.failed"));
    } finally {
      setIsCreatingEntity(false);
    }
  }

  function handleSignOut() {
    signOut();
    setStatusMessage(t("web.entityCreate.signedOut"));
  }

  return (
    <section className="creation-card" aria-labelledby="entity-creation-heading">
      <p className="eyebrow">{t("web.entityCreate.eyebrow")}</p>
      <h1 id="entity-creation-heading">{t("web.entityCreate.pageTitle")}</h1>
      <p className="hero-copy">{t("web.entityCreate.subtitle")}</p>

      <div className="creation-grid">
        <MinimalAuthPanel
          authSession={authSession}
          contextLabel={t("web.entityCreate.signInContext")}
          onAuthSuccess={(authResponse) => {
            const storedSession = storeAuthSession(authResponse);
            setStatusMessage(t("auth.signedInAs", { displayName: storedSession.displayName }));
          }}
          onSignOut={handleSignOut}
        />

        <form className="panel-card form-stack" onSubmit={handleCreateEntitySubmit}>
          <div className="section-heading">
            <p className="result-type">{t("web.entityCreate.step")}</p>
            <h2>{t("web.entityCreate.detailsTitle")}</h2>
          </div>

          <label className="field-label">
            {t("web.entityCreate.titleLabel")}
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
            {t("web.entityCreate.typeLabel")}
            <select
              required
              value={type}
              onChange={(event) => {
                setType(event.target.value as EntityType);
              }}
            >
              {entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {formatEntityTypeLabel(t, entityType)}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            {t("web.entityCreate.canonicalUrl")}
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
            {t("web.entityCreate.descriptionLabel")}
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
            {isCreatingEntity ? t("web.entityCreate.creating") : t("web.entityCreate.createEntity")}
          </button>
        </form>
      </div>

      <FormFeedback errorMessage={errorMessage} statusMessage={statusMessage} />
    </section>
  );
}
