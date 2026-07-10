"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage } from "../../../lib/api/read-api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { createTop, fetchTopCategories, replaceTopItems, updateTop } from "../api/tops-api";
import {
  isValidTopSlug,
  MAX_TOP_ITEMS,
  MAX_TOP_NOTE_LENGTH,
  MIN_TOP_ITEMS,
  slugifyTopTitle
} from "../lib/top-limits";
import { moveDraftItemToIndex, moveDraftItemToPosition } from "../lib/top-editor-reorder";
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
  const { resolvedLocale } = useLocale();
  const { authSession } = useAuthSession();
  const [title, setTitle] = useState(initialTop?.title ?? "");
  const [description, setDescription] = useState(initialTop?.description ?? "");
  const [slug, setSlug] = useState(initialTop?.slug ?? "");
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
  const [editingPositionEntityId, setEditingPositionEntityId] = useState<string | null>(null);
  const [editingPositionValue, setEditingPositionValue] = useState("");
  const positionApplyTimersRef = useRef<Map<string, number>>(new Map());

  const addedEntityIds = useMemo(
    () => new Set(draftItems.map((item) => item.entity.id)),
    [draftItems]
  );

  useEffect(() => {
    if (mode === "create") {
      setSlug(slugifyTopTitle(title));
    }
  }, [mode, title]);

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

    setDraftItems((current) => moveDraftItemToIndex(current, index, targetIndex));
  }

  function moveItemToPosition(index: number, position: number) {
    setDraftItems((current) => moveDraftItemToPosition(current, index, position));
  }

  function moveItemToTop(index: number) {
    moveItemToPosition(index, 1);
  }

  function moveItemToBottom(index: number) {
    moveItemToPosition(index, draftItems.length);
  }

  useEffect(() => {
    return () => {
      for (const timerId of positionApplyTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }

      positionApplyTimersRef.current.clear();
    };
  }, []);

  function clearPositionApplyTimer(entityId: string): void {
    const timerId = positionApplyTimersRef.current.get(entityId);

    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      positionApplyTimersRef.current.delete(entityId);
    }
  }

  function commitPositionInput(entityId: string, rawValue: string): void {
    clearPositionApplyTimer(entityId);

    const parsed = Number(rawValue.trim());

    if (!Number.isFinite(parsed)) {
      return;
    }

    setDraftItems((current) => {
      const fromIndex = current.findIndex((item) => item.entity.id === entityId);

      if (fromIndex === -1) {
        return current;
      }

      return moveDraftItemToPosition(current, fromIndex, parsed);
    });
    setEditingPositionEntityId(null);
    setEditingPositionValue("");
  }

  function schedulePositionInput(entityId: string, rawValue: string): void {
    clearPositionApplyTimer(entityId);

    const timerId = window.setTimeout(() => {
      positionApplyTimersRef.current.delete(entityId);
      commitPositionInput(entityId, rawValue);
    }, 350);

    positionApplyTimersRef.current.set(entityId, timerId);
  }

  function beginPositionEditing(entityId: string, position: number): void {
    clearPositionApplyTimer(entityId);
    setEditingPositionEntityId(entityId);
    setEditingPositionValue(String(position));
  }

  function resetPositionEditing(entityId?: string): void {
    if (entityId) {
      clearPositionApplyTimer(entityId);
    }

    setEditingPositionEntityId(null);
    setEditingPositionValue("");
  }

  function stepItemPosition(index: number, direction: -1 | 1): void {
    const item = draftItems[index];

    if (!item) {
      return;
    }

    resetPositionEditing(item.entity.id);
    moveItem(index, direction);
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
                  slug: slugifyTopTitle(title.trim()),
                  title: title.trim(),
                  ...rankPayload
                },
                authSession.accessToken,
                resolvedLocale
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
              {mode === "create" ? (
                <p className="muted-copy top-editor-slug-preview">
                  {t("web.userTops.slugPreview", { slug: slug || slugifyTopTitle(title) })}
                </p>
              ) : null}
            </label>

            {mode === "edit" ? (
              <label className="field">
                <span>{t("web.userTops.fieldSlug")}</span>
                <input value={slug} disabled readOnly />
              </label>
            ) : null}

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
                          <div className="top-editor-position-control">
                            <button
                              type="button"
                              className="top-editor-position-step"
                              disabled={index === 0}
                              aria-label={t("web.userTops.moveUpAria", { title: item.entity.title })}
                              onClick={() => {
                                stepItemPosition(index, -1);
                              }}
                            >
                              ▲
                            </button>
                            <div className="top-editor-position-field">
                              {editingPositionEntityId === item.entity.id ? (
                                <input
                                  autoFocus
                                  className="top-editor-position-input"
                                  type="text"
                                  value={editingPositionValue}
                                  inputMode="numeric"
                                  aria-label={t("web.userTops.positionInputAria", {
                                    title: item.entity.title
                                  })}
                                  onChange={(event) => {
                                    const nextValue = event.currentTarget.value;
                                    setEditingPositionValue(nextValue);

                                    const parsed = Number(nextValue);

                                    if (
                                      !Number.isFinite(parsed) ||
                                      parsed < 1 ||
                                      parsed > draftItems.length ||
                                      nextValue.trim() !== String(parsed)
                                    ) {
                                      return;
                                    }

                                    if (parsed === index + 1) {
                                      return;
                                    }

                                    if (draftItems.length < 10 || nextValue.length >= 2) {
                                      commitPositionInput(item.entity.id, nextValue);
                                      return;
                                    }

                                    schedulePositionInput(item.entity.id, nextValue);
                                  }}
                                  onBlur={(event) => {
                                    commitPositionInput(item.entity.id, event.currentTarget.value);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "ArrowUp") {
                                      event.preventDefault();
                                      stepItemPosition(index, -1);
                                      return;
                                    }

                                    if (event.key === "ArrowDown") {
                                      event.preventDefault();
                                      stepItemPosition(index, 1);
                                      return;
                                    }

                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      commitPositionInput(item.entity.id, event.currentTarget.value);
                                      event.currentTarget.blur();
                                    }

                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      resetPositionEditing(item.entity.id);
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="top-editor-position-value"
                                  aria-label={t("web.userTops.positionInputAria", {
                                    title: item.entity.title
                                  })}
                                  onClick={() => {
                                    beginPositionEditing(item.entity.id, index + 1);
                                  }}
                                >
                                  {index + 1}
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              className="top-editor-position-step"
                              disabled={index === draftItems.length - 1}
                              aria-label={t("web.userTops.moveDownAria", {
                                title: item.entity.title
                              })}
                              onClick={() => {
                                stepItemPosition(index, 1);
                              }}
                            >
                              ▼
                            </button>
                          </div>
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
                          <div className="home-hub-actions top-editor-item-actions">
                            {rankMode !== "SYSTEM" ? (
                              <>
                                <button
                                  type="button"
                                  className="button-secondary top-editor-item-action"
                                  disabled={index === 0}
                                  onClick={() => {
                                    moveItemToTop(index);
                                  }}
                                >
                                  {t("web.userTops.moveToTop")}
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary top-editor-item-action"
                                  disabled={index === draftItems.length - 1}
                                  onClick={() => {
                                    moveItemToBottom(index);
                                  }}
                                >
                                  {t("web.userTops.moveToBottom")}
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className="button-secondary top-editor-item-action"
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
