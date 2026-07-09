"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage } from "../../../lib/api/read-api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { createTop, fetchTopCategories, replaceTopItems, updateTop } from "../api/tops-api";
import {
  isValidTopSlug,
  MAX_TOP_ITEMS,
  MAX_TOP_NOTE_LENGTH,
  MIN_TOP_ITEMS,
  slugifyTopTitle
} from "../lib/top-limits";
import type { DraftTopItem, Top, TopCategory, TopItemEntity, TopRankModeInput } from "../types/tops";
import { TopCategoryPicker } from "./top-category-picker";
import { TopEditorEntitySearch } from "./top-editor-entity-search";

interface TopEditorViewProps {
  mode: "create" | "edit";
  initialTop?: Top | undefined;
}

export function TopEditorView({ mode, initialTop }: TopEditorViewProps) {
  const router = useRouter();
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [title, setTitle] = useState(initialTop?.title ?? "");
  const [description, setDescription] = useState(initialTop?.description ?? "");
  const [slug, setSlug] = useState(initialTop?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [draftItems, setDraftItems] = useState<DraftTopItem[]>(() =>
    (initialTop?.items ?? []).map((item) => ({
      entity: item.entity,
      note: item.note ?? ""
    }))
  );
  const [categoryId, setCategoryId] = useState("");
  const [rankMode, setRankMode] = useState<TopRankModeInput>(() => {
    if (initialTop?.rankMode === "HYBRID" || initialTop?.rankMode === "SYSTEM") {
      return initialTop.rankMode;
    }

    if (mode === "edit" && initialTop?.rankMode === "MANUAL") {
      return "MANUAL";
    }

    return "HYBRID";
  });
  const [systemSortKey, setSystemSortKey] = useState<"POPULARITY" | "RATING" | "RELIABILITY">(
    initialTop?.systemSortKey === "POPULARITY" ||
      initialTop?.systemSortKey === "RATING" ||
      initialTop?.systemSortKey === "RELIABILITY"
      ? initialTop.systemSortKey
      : "RELIABILITY"
  );
  const [categories, setCategories] = useState<TopCategory[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const addedEntityIds = useMemo(
    () => new Set(draftItems.map((item) => item.entity.id)),
    [draftItems]
  );

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugifyTopTitle(title));
    }
  }, [slugTouched, title]);

  useEffect(() => {
    let cancelled = false;

    void fetchTopCategories()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setCategories(response.items);

        if (mode === "edit" && initialTop?.category) {
          const matched = response.items.find((item) => item.slug === initialTop.category?.slug);

          if (matched) {
            setCategoryId(matched.id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialTop?.category, mode]);

  const canSubmit = useMemo(() => {
    return (
      Boolean(authSession?.accessToken) &&
      title.trim().length > 0 &&
      isValidTopSlug(slug) &&
      (mode === "edit" || categoryId.length > 0) &&
      draftItems.length >= MIN_TOP_ITEMS &&
      draftItems.length <= MAX_TOP_ITEMS
    );
  }, [authSession?.accessToken, categoryId, draftItems.length, mode, slug, title]);

  function addEntity(entity: TopItemEntity) {
    if (draftItems.some((item) => item.entity.id === entity.id)) {
      setStatusMessage(t("web.userTops.entityAlreadyAdded"));
      return;
    }

    if (draftItems.length >= MAX_TOP_ITEMS) {
      setErrorMessage(t("web.userTops.maxItems", { count: String(MAX_TOP_ITEMS) }));
      return;
    }

    setDraftItems((current) => [...current, { entity, note: "" }]);
    setStatusMessage(t("web.userTops.entityAdded", { title: entity.title }));
    setErrorMessage(null);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= draftItems.length) {
      return;
    }

    setDraftItems((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);

      if (!moved) {
        return current;
      }

      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function removeItem(index: number) {
    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function updateNote(index: number, note: string) {
    setDraftItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, note: note.slice(0, MAX_TOP_NOTE_LENGTH) } : item
      )
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!authSession?.accessToken) {
      setErrorMessage(t("web.userTops.signInRequired"));
      return;
    }

    if (!isValidTopSlug(slug)) {
      setErrorMessage(t("web.userTops.invalidSlug"));
      return;
    }

    if (draftItems.length < MIN_TOP_ITEMS) {
      setErrorMessage(t("web.userTops.minItems", { count: String(MIN_TOP_ITEMS) }));
      return;
    }

    if (mode === "create" && !categoryId) {
      setErrorMessage(t("web.userTops.categoryRequired"));
      return;
    }

    setIsSaving(true);

    try {
      const matchedCategory = categories.find((item) => item.id === categoryId);
      const rankPayload =
        rankMode === "MANUAL"
          ? { rankMode: "MANUAL" as const }
          : { rankMode, systemSortKey };
      let topId = initialTop?.id ?? "";
      let topSlug = initialTop?.slug ?? slug.trim();

      try {
        const top =
          mode === "edit" && initialTop
            ? await updateTop(
                initialTop.id,
                {
                  ...(matchedCategory ? { categoryId: matchedCategory.id } : {}),
                  description: description.trim() || null,
                  title: title.trim(),
                  ...rankPayload,
                  ...(rankMode === "MANUAL" ? { systemSortKey: null } : {})
                },
                authSession.accessToken
              )
            : await createTop(
                {
                  categoryId,
                  ...(description.trim() ? { description: description.trim() } : {}),
                  slug: slug.trim(),
                  title: title.trim(),
                  ...rankPayload
                },
                authSession.accessToken
              );

        topId = top.id;
        topSlug = top.slug;
      } catch (error) {
        setErrorMessage(
          (error instanceof ApiError ? readApiErrorMessage(error.body) : null) ??
            t("web.userTops.saveFailed")
        );
        return;
      }

      try {
        const savedTop = await replaceTopItems(
          topId,
          draftItems.map((item) => ({
            entityId: item.entity.id,
            note: item.note.trim() || null
          })),
          authSession.accessToken
        );

        router.push(`/tops/${savedTop.slug}`);
      } catch (error) {
        setErrorMessage(
          (error instanceof ApiError ? readApiErrorMessage(error.body) : null) ??
            t("web.userTops.itemsSaveFailed")
        );
        router.push(`/tops/${topSlug}/edit`);
      }
    } catch {
      setErrorMessage(t("web.userTops.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="home-hub">
      <section className="home-hub-card creation-card" aria-labelledby="top-editor-heading">
        <p className="eyebrow">{t("web.userTops.editorEyebrow")}</p>
        <h1 id="top-editor-heading">
          {mode === "edit" ? t("web.userTops.editTitle") : t("web.userTops.createTitle")}
        </h1>
        <p className="hero-copy">{t("web.userTops.editorSubtitle")}</p>

        <div className="creation-grid top-editor-grid">
          <TopEditorEntitySearch addedEntityIds={addedEntityIds} onAddEntity={addEntity} />

          <form className="creation-form panel-card top-editor-form-panel" onSubmit={handleSubmit}>
            <label className="field">
              <span>{t("web.userTops.fieldTitle")}</span>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                maxLength={200}
                required
              />
            </label>

            <label className="field">
              <span>{t("web.userTops.fieldSlug")}</span>
              <input
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value.trim().toLowerCase());
                }}
                maxLength={120}
                required
                disabled={mode === "edit"}
              />
            </label>

            <TopCategoryPicker
              categories={categories}
              categoryId={categoryId}
              disabled={isSaving}
              onCategoryChange={setCategoryId}
            />

            <label className="field">
              <span>{t("web.userTops.fieldDescription")}</span>
              <textarea
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                maxLength={2000}
                rows={3}
              />
            </label>

            <details className="field" open>
              <summary>{t("web.userTops.advancedSettingsTitle")}</summary>
              <fieldset className="rank-mode-group">
                <legend>{t("web.userTops.rankModeLabel")}</legend>
                <label className="rank-mode-option">
                  <input
                    type="radio"
                    name="rankMode"
                    value="MANUAL"
                    checked={rankMode === "MANUAL"}
                    onChange={() => {
                      setRankMode("MANUAL");
                    }}
                  />
                  <span>{t("web.userTops.rankModeManual")}</span>
                </label>
                <label className="rank-mode-option">
                  <input
                    type="radio"
                    name="rankMode"
                    value="HYBRID"
                    checked={rankMode === "HYBRID"}
                    onChange={() => {
                      setRankMode("HYBRID");
                    }}
                  />
                  <span>{t("web.userTops.rankModeHybrid")}</span>
                </label>
                <label className="rank-mode-option">
                  <input
                    type="radio"
                    name="rankMode"
                    value="SYSTEM"
                    checked={rankMode === "SYSTEM"}
                    onChange={() => {
                      setRankMode("SYSTEM");
                    }}
                  />
                  <span>{t("web.userTops.rankModeSystem")}</span>
                </label>
              </fieldset>
              {rankMode === "HYBRID" || rankMode === "SYSTEM" ? (
                <label className="field">
                  <span>{t("web.userTops.systemSortKeyLabel")}</span>
                  <select
                    value={systemSortKey}
                    onChange={(event) => {
                      setSystemSortKey(
                        event.target.value as "POPULARITY" | "RATING" | "RELIABILITY"
                      );
                    }}
                  >
                    <option value="RELIABILITY">{t("web.userTops.systemSortKeyRELIABILITY")}</option>
                    <option value="POPULARITY">{t("web.userTops.systemSortKeyPOPULARITY")}</option>
                    <option value="RATING">{t("web.userTops.systemSortKeyRATING")}</option>
                  </select>
                </label>
              ) : null}
            </details>

            <div className="field">
              <span>
                {t("web.userTops.itemsLabel", {
                  count: String(draftItems.length),
                  max: String(MAX_TOP_ITEMS),
                  min: String(MIN_TOP_ITEMS)
                })}
              </span>

              {draftItems.length > 0 ? (
                <ol className="discovery-rank-list">
                  {draftItems.map((item, index) => (
                    <li key={item.entity.id}>
                      <div className="top-editor-item">
                        {rankMode !== "SYSTEM" ? (
                          <span className="discovery-rank-position">{index + 1}</span>
                        ) : null}
                        <div className="top-editor-item-body">
                          <strong>{item.entity.title}</strong>
                          <textarea
                            value={item.note}
                            onChange={(event) => {
                              updateNote(index, event.target.value);
                            }}
                            placeholder={t("web.userTops.notePlaceholder")}
                            rows={2}
                            maxLength={MAX_TOP_NOTE_LENGTH}
                          />
                          <div className="home-hub-actions">
                            {rankMode !== "SYSTEM" ? (
                              <>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  disabled={index === 0}
                                  onClick={() => {
                                    moveItem(index, -1);
                                  }}
                                >
                                  {t("web.userTops.moveUp")}
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  disabled={index === draftItems.length - 1}
                                  onClick={() => {
                                    moveItem(index, 1);
                                  }}
                                >
                                  {t("web.userTops.moveDown")}
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => {
                                removeItem(index);
                              }}
                            >
                              {t("web.userTops.removeItem")}
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted-copy">{t("web.userTops.itemsEmpty")}</p>
              )}
            </div>

            <FormFeedback errorMessage={errorMessage} statusMessage={statusMessage} />

            {!authSession?.accessToken ? (
              <p className="muted-copy">{t("web.userTops.signInRequired")}</p>
            ) : null}

            <button className="button-primary" type="submit" disabled={!canSubmit || isSaving}>
              {isSaving ? t("web.userTops.saving") : t("web.userTops.publish")}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
