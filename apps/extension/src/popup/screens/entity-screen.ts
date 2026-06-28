import type { TranslateFn } from "@reviewo/i18n";

import { createGetAuthSessionMessage, ExtensionMessageType } from "../../shared/messages.js";
import { createExtensionTranslator } from "../../shared/extension-i18n.js";
import { readExtensionPreferences } from "../../shared/extension-preferences-storage.js";
import { buildRatingCardSummary } from "../../content/rating-card/format-display.js";
import { resolveMyEntityRatingScore } from "../../content/rating-card/resolve-my-entity-rating.js";
import {
  bindEntityReviewsSection,
  loadEntityReviewsSectionState,
  renderEntityReviewsSectionMarkup
} from "../entity-reviews-section.js";
import { rateEntityViewModel } from "../services/rate-entity-view-model.js";
import { renderPopupRatePanel } from "../popup-rate-panel.js";
import { bindAuthPromptTriggers } from "../bind-auth-prompt-triggers.js";
import {
  bindChatDrawerToggle,
  renderChatDrawerSectionMarkup
} from "../components/chat-drawer.js";
import { sendExtensionMessage } from "../services/popup-messaging.js";
import { buildEntityPageUrl, escapeHtml } from "../view-helpers.js";
import type { EntityViewModel } from "../types.js";

export interface EntityScreenActions {
  onEntityUpdate: (entity: EntityViewModel) => void;
  onOpenParent?: (entity: EntityViewModel) => void;
  onRequestSignIn: () => void;
}

export async function renderEntityScreen(
  container: HTMLElement,
  entity: EntityViewModel,
  actions: EntityScreenActions
): Promise<void> {
  const t = await createExtensionTranslator();
  const sessionResponse = await sendExtensionMessage<{
    payload?: { session?: { accessToken: string } | null };
    type?: string;
  }>(createGetAuthSessionMessage());
  const session =
    sessionResponse?.type === ExtensionMessageType.AuthSessionResult
      ? sessionResponse.payload?.session ?? null
      : null;
  const isAuthenticated = Boolean(session?.accessToken);
  const currentUserId = session?.userId;
  const preferences = await readExtensionPreferences();
  const myRatingScore = await resolveEntityMyRatingScore(entity, isAuthenticated);
  const ratePanelMarkup = renderPopupRatePanel(t, {
    isAuthenticated,
    myRatingScore,
    rateScoreDataAttribute: "data-score",
    showLabel: false
  });

  const statsMarkup =
    entity.status === "found" && entity.avgScore !== undefined && entity.votesCount !== undefined
      ? renderFoundStats(entity, t)
      : `<p class="muted-copy">${escapeHtml(entity.status === "not_found" ? t("entity.stats.notFound") : t("entity.stats.loading"))}</p>`;

  const entityPagePath =
    entity.entityPagePath ?? (entity.entityId ? `/entities/${entity.entityId}` : null);
  const openPageMarkup = entityPagePath
    ? `<a class="primary-button link-button" href="${escapeHtml(buildEntityPageUrl(entityPagePath))}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("entity.openPage"))}</a>`
    : "";
  const breadcrumbMarkup = renderEntityBreadcrumb(entity, t);
  const rateSectionMarkup = `
    <section class="rate-panel">
      <h2>${escapeHtml(entity.status === "found" ? t("entity.rateSection.titleFound") : t("entity.rateSection.titleNotFound"))}</h2>
      ${ratePanelMarkup}
    </section>
  `;

  container.innerHTML = `
    <section class="screen entity-screen">
      <div class="entity-screen-scroll">
        ${breadcrumbMarkup}
        <div class="entity-hero">
          <p class="section-eyebrow">${escapeHtml(entity.status === "found" ? t("entity.eyebrow.found") : t("entity.eyebrow.notFound"))}</p>
          <h1>${escapeHtml(entity.title)}</h1>
          <p class="muted-copy">${escapeHtml(entity.canonicalUrl || entity.pageUrl)}</p>
        </div>
        <div class="entity-stats">${statsMarkup}</div>
        ${openPageMarkup}
        ${rateSectionMarkup}
        <div class="entity-reviews-host" data-entity-reviews-host${
          entity.status === "found" && entity.entityId ? "" : ' hidden="true"'
        }></div>
      </div>
      <div class="entity-chat-actions" data-entity-chat-actions${
        entity.status === "found" && entity.entityId ? "" : ' hidden="true"'
      }></div>
    </section>
  `;

  if (entity.status === "found" && entity.entityId) {
    await mountEntityReviewsSection(
      container.querySelector<HTMLElement>("[data-entity-reviews-host]"),
      entity.entityId,
      isAuthenticated,
      currentUserId,
      preferences,
      t
    );
    mountEntityChatSection(
      container,
      entity.entityId,
      entity.title,
      isAuthenticated,
      session?.accessToken ?? null,
      currentUserId,
      t,
      actions
    );
  }

  container.querySelectorAll<HTMLButtonElement>("[data-score]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAuthenticated) {
        actions.onRequestSignIn();
        return;
      }

      const score = Number(button.dataset.score);

      if (!Number.isInteger(score)) {
        return;
      }

      void submitRating(entity, score, container, actions, t);
    });
  });

  bindAuthPromptTriggers(container, actions.onRequestSignIn);

  container.querySelector<HTMLButtonElement>("[data-open-parent]")?.addEventListener("click", () => {
    if (!entity.parentEntityId || !entity.parentTitle || !actions.onOpenParent) {
      return;
    }

    actions.onOpenParent({
      canonicalUrl: "",
      entityId: entity.parentEntityId,
      entityPagePath: entity.parentEntityPagePath ?? `/entities/${entity.parentEntityId}`,
      pageUrl: "",
      status: "found",
      title: entity.parentTitle
    });
  });
}

async function mountEntityReviewsSection(
  host: HTMLElement | null,
  entityId: string,
  isAuthenticated: boolean,
  currentUserId: string | undefined,
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>,
  t: TranslateFn
): Promise<void> {
  if (!host) {
    return;
  }

  host.hidden = false;
  host.innerHTML = `<p class="muted-copy">${escapeHtml(t("reviews.loading"))}</p>`;

  const loaded = await loadEntityReviewsSectionState(entityId, isAuthenticated, currentUserId, {
    displayMode: preferences.popupReviewDisplayMode,
    hideMyReviewWhenSaved: false,
    reviewsLimit: preferences.popupReviewsLimit
  });

  if (!loaded.state) {
    host.innerHTML = `<p class="status-copy-error">${escapeHtml(
      loaded.errorMessage ?? t("reviews.loadError")
    )}</p>`;
    return;
  }

  host.innerHTML = renderEntityReviewsSectionMarkup(t, loaded.state, loaded.myReviewText ?? "", undefined, {
    hideMyReviewWhenSaved: false
  });
  bindEntityReviewsSection(t, host, entityId, loaded.state, loaded.myReviewText ?? "", {
    hideMyReviewWhenSaved: false
  });
}

function renderEntityBreadcrumb(entity: EntityViewModel, t: TranslateFn): string {
  if (!entity.parentEntityId || !entity.parentTitle) {
    return "";
  }

  return `
    <nav class="entity-breadcrumb" aria-label="${escapeHtml(t("entity.breadcrumb.ariaLabel"))}">
      <button type="button" class="entity-breadcrumb-parent" data-open-parent>
        ${escapeHtml(entity.parentTitle)}
      </button>
      <span class="entity-breadcrumb-separator" aria-hidden="true">→</span>
      <span class="entity-breadcrumb-current">${escapeHtml(entity.title)}</span>
    </nav>
  `;
}

async function resolveEntityMyRatingScore(
  entity: EntityViewModel,
  isAuthenticated: boolean
): Promise<number | null> {
  if (!isAuthenticated) {
    return null;
  }

  if (typeof entity.myRatingScore === "number") {
    return entity.myRatingScore;
  }

  if (entity.entityId) {
    return resolveMyEntityRatingScore(entity.entityId);
  }

  return null;
}

async function submitRating(
  entity: EntityViewModel,
  score: number,
  container: HTMLElement,
  actions: EntityScreenActions,
  t: TranslateFn
): Promise<void> {
  const statusElement = container.querySelector<HTMLParagraphElement>("[data-rate-status]");

  if (statusElement) {
    statusElement.hidden = false;
    statusElement.textContent = t("rating.saving");
    statusElement.classList.remove("status-copy-error", "status-copy-success");
  }

  const result = await rateEntityViewModel(entity, score);

  if (result.updated) {
    actions.onEntityUpdate(result.updated);
    setRateStatus(
      container,
      entity.status === "not_found" && result.updated.entityId
        ? t("rating.firstPageCreated")
        : t("rating.saved"),
      "success"
    );
    await renderEntityScreen(container, result.updated, actions);
    return;
  }

  setRateStatus(container, result.errorMessage ?? t("rating.saveError"), "error");
}

function renderFoundStats(entity: EntityViewModel, t: TranslateFn): string {
  if (entity.avgScore === undefined || entity.votesCount === undefined) {
    return `<p class="muted-copy">${escapeHtml(t("rating.stats.empty"))}</p>`;
  }

  if (entity.votesCount === 0) {
    return `
      <div class="entity-stat-grid entity-stat-grid-empty">
        <p class="entity-empty-rating">${escapeHtml(t("rating.stats.noRatings"))}</p>
        <p class="muted-copy">${escapeHtml(t("rating.stats.beFirst"))}</p>
      </div>
    `;
  }

  const summary = buildRatingCardSummary(t, {
    entity: {
      canonicalUrl: entity.canonicalUrl,
      description: null,
      id: entity.entityId ?? "",
      slug: "",
      title: entity.title,
      type: "website"
    },
    rating: {
      avgScore: entity.avgScore,
      entityId: entity.entityId ?? "",
      updatedAt: new Date().toISOString(),
      votesCount: entity.votesCount
    },
    status: "found",
    trust: {
      confidence: entity.trustConfidence ?? 0
    },
    url: {
      canonical: entity.canonicalUrl,
      input: entity.pageUrl
    },
    web: {
      entityPagePath: entity.entityPagePath ?? `/entities/${entity.entityId ?? ""}`
    }
  });

  return `
    <div class="entity-stat-grid">
      <div>
        <span class="entity-stat-value">${escapeHtml(summary.averageScoreLabel)}</span>
        <span class="entity-stat-scale">${escapeHtml(t("rating.scaleSuffix"))}</span>
      </div>
      <p class="muted-copy">${escapeHtml(summary.metaLabel)}</p>
    </div>
  `;
}

function setRateStatus(
  container: HTMLElement,
  message: string,
  tone: "default" | "error" | "success"
): void {
  const statusElement = container.querySelector<HTMLParagraphElement>("[data-rate-status]");

  if (!statusElement) {
    return;
  }

  statusElement.hidden = !message;
  statusElement.textContent = message;
  statusElement.classList.toggle("status-copy-error", tone === "error");
  statusElement.classList.toggle("status-copy-success", tone === "success");
}

function mountEntityChatSection(
  container: HTMLElement,
  entityId: string,
  entityTitle: string,
  isAuthenticated: boolean,
  accessToken: string | null,
  currentUserId: string | undefined,
  t: TranslateFn,
  actions: EntityScreenActions
): void {
  const host = container.querySelector<HTMLElement>("[data-entity-chat-actions]");

  if (!host) {
    return;
  }

  host.hidden = false;
  host.innerHTML = renderChatDrawerSectionMarkup(t, entityId);
  bindChatDrawerToggle(
    host,
    t,
    entityId,
    {
      accessToken,
      currentUserId,
      entityId,
      entityTitle,
      isAuthenticated
    },
    {
      onRequestSignIn: actions.onRequestSignIn
    }
  );
}
