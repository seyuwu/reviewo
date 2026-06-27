import { createGetAuthSessionMessage, ExtensionMessageType } from "../../shared/messages.js";
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
import { sendExtensionMessage } from "../services/popup-messaging.js";
import { buildEntityPageUrl, escapeHtml } from "../view-helpers.js";
import type { EntityViewModel } from "../types.js";

export interface EntityScreenActions {
  onEntityUpdate: (entity: EntityViewModel) => void;
  onOpenParent?: (entity: EntityViewModel) => void;
}

export async function renderEntityScreen(
  container: HTMLElement,
  entity: EntityViewModel,
  actions: EntityScreenActions
): Promise<void> {
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
  const ratePanelMarkup = renderPopupRatePanel({
    isAuthenticated,
    myRatingScore,
    rateScoreDataAttribute: "data-score",
    showLabel: false
  });

  const statsMarkup =
    entity.status === "found" && entity.avgScore !== undefined && entity.votesCount !== undefined
      ? renderFoundStats(entity)
      : `<p class="muted-copy">${entity.status === "not_found" ? "This site is not in Reviewo yet." : "Loading entity stats..."}</p>`;

  const entityPagePath =
    entity.entityPagePath ?? (entity.entityId ? `/entities/${entity.entityId}` : null);
  const openPageMarkup = entityPagePath
    ? `<a class="primary-button link-button" href="${escapeHtml(buildEntityPageUrl(entityPagePath))}" target="_blank" rel="noopener noreferrer">Open page</a>`
    : "";
  const breadcrumbMarkup = renderEntityBreadcrumb(entity);
  const rateSectionMarkup = `
    <section class="rate-panel">
      <h2>${entity.status === "found" ? "Your rating" : "Be the first to rate"}</h2>
      ${ratePanelMarkup}
    </section>
  `;

  container.innerHTML = `
    <section class="screen entity-screen">
      ${breadcrumbMarkup}
      <div class="entity-hero">
        <p class="section-eyebrow">${entity.status === "found" ? "Entity" : "Unknown site"}</p>
        <h1>${escapeHtml(entity.title)}</h1>
        <p class="muted-copy">${escapeHtml(entity.canonicalUrl || entity.pageUrl)}</p>
      </div>
      <div class="entity-stats">${statsMarkup}</div>
      ${openPageMarkup}
      ${rateSectionMarkup}
      <div class="entity-reviews-host" data-entity-reviews-host${
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
      preferences
    );
  }

  container.querySelectorAll<HTMLButtonElement>("[data-score]").forEach((button) => {
    button.addEventListener("click", () => {
      const score = Number(button.dataset.score);

      if (!Number.isInteger(score)) {
        return;
      }

      void submitRating(entity, score, container, actions);
    });
  });

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
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>
): Promise<void> {
  if (!host) {
    return;
  }

  host.hidden = false;
  host.innerHTML = `<p class="muted-copy">Loading reviews...</p>`;

  const loaded = await loadEntityReviewsSectionState(entityId, isAuthenticated, currentUserId, {
    displayMode: preferences.popupReviewDisplayMode,
    hideMyReviewWhenSaved: false,
    reviewsLimit: preferences.popupReviewsLimit
  });

  if (!loaded.state) {
    host.innerHTML = `<p class="status-copy-error">${escapeHtml(
      loaded.errorMessage ?? "Could not load reviews."
    )}</p>`;
    return;
  }

  host.innerHTML = renderEntityReviewsSectionMarkup(loaded.state, loaded.myReviewText ?? "", undefined, {
    hideMyReviewWhenSaved: false
  });
  bindEntityReviewsSection(host, entityId, loaded.state, loaded.myReviewText ?? "", {
    hideMyReviewWhenSaved: false
  });
}

function renderEntityBreadcrumb(entity: EntityViewModel): string {
  if (!entity.parentEntityId || !entity.parentTitle) {
    return "";
  }

  return `
    <nav class="entity-breadcrumb" aria-label="Entity hierarchy">
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
  actions: EntityScreenActions
): Promise<void> {
  const statusElement = container.querySelector<HTMLParagraphElement>("[data-rate-status]");

  if (statusElement) {
    statusElement.hidden = false;
    statusElement.textContent = "Saving rating...";
    statusElement.classList.remove("status-copy-error", "status-copy-success");
  }

  const result = await rateEntityViewModel(entity, score);

  if (result.updated) {
    actions.onEntityUpdate(result.updated);
    setRateStatus(
      container,
      entity.status === "not_found" && result.updated.entityId
        ? "You created the first Reviewo page for this site."
        : "Rating saved.",
      "success"
    );
    await renderEntityScreen(container, result.updated, actions);
    return;
  }

  setRateStatus(container, result.errorMessage ?? "Could not save rating.", "error");
}

function renderFoundStats(entity: EntityViewModel): string {
  if (entity.avgScore === undefined || entity.votesCount === undefined) {
    return `<p class="muted-copy">No ratings yet · Be the first to rate</p>`;
  }

  if (entity.votesCount === 0) {
    return `
      <div class="entity-stat-grid entity-stat-grid-empty">
        <p class="entity-empty-rating">No ratings yet</p>
        <p class="muted-copy">Be the first to rate</p>
      </div>
    `;
  }

  const summary = buildRatingCardSummary({
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
        <span class="entity-stat-scale">/ 5</span>
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
