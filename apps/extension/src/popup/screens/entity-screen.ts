import { createGetAuthSessionMessage, ExtensionMessageType } from "../../shared/messages.js";
import { submitEntityRating } from "../../content/rating-card/submit-entity-rating.js";
import { submitEntityRatingByUrl } from "../../content/rating-card/submit-entity-rating-by-url.js";
import { buildRatingCardSummary } from "../../content/rating-card/format-display.js";
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
  const isAuthenticated =
    sessionResponse?.type === ExtensionMessageType.AuthSessionResult &&
    Boolean(sessionResponse.payload?.session?.accessToken);

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
      <section class="rate-panel">
        <h2>${entity.status === "found" ? "Your rating" : "Be the first to rate"}</h2>
        <div class="reviewo-rate-controls popup-rate-controls" role="group" aria-label="Rate this site">
          ${[1, 2, 3, 4, 5]
            .map(
              (score) => `
            <button type="button" class="reviewo-rate-button" data-score="${score}" ${isAuthenticated ? "" : "disabled"}>
              ${score}
            </button>
          `
            )
            .join("")}
        </div>
        <p class="muted-copy ${isAuthenticated ? "is-hidden" : ""}">Sign in to rate.</p>
        <p class="rate-status" data-rate-status hidden></p>
      </section>
    </section>
  `;

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

  if (entity.status === "found" && entity.entityId) {
    const result = await submitEntityRating(entity.entityId, score);

    if (result.result) {
      const updated: EntityViewModel = {
        ...entity,
        avgScore: result.result.rating.avgScore,
        entityPagePath: result.result.web.entityPagePath,
        status: "found",
        title: result.result.entity.title,
        trustConfidence: result.result.trust.confidence,
        votesCount: result.result.rating.votesCount
      };
      actions.onEntityUpdate(updated);
      setRateStatus(container, "Rating saved.", "success");
      await renderEntityScreen(container, updated, actions);
      return;
    }

    setRateStatus(container, result.errorMessage ?? "Could not save rating.", "error");
    return;
  }

  const result = await submitEntityRatingByUrl(entity.pageUrl, score, entity.title);

  if (result.result) {
    const updated: EntityViewModel = {
      avgScore: result.result.rating.avgScore,
      canonicalUrl: result.result.entity.canonicalUrl ?? entity.canonicalUrl,
      entityId: result.result.entity.id,
      entityPagePath: result.result.web.entityPagePath,
      pageUrl: entity.pageUrl,
      status: "found",
      title: result.result.entity.title,
      trustConfidence: result.result.trust.confidence,
      votesCount: result.result.rating.votesCount,
      parentEntityId: entity.parentEntityId,
      parentEntityPagePath: entity.parentEntityPagePath,
      parentTitle: entity.parentTitle
    };
    actions.onEntityUpdate(updated);
    setRateStatus(
      container,
      result.result.entityProvision.mode === "created"
        ? "You created the first Reviewo page for this site."
        : "Rating saved.",
      "success"
    );
    await renderEntityScreen(container, updated, actions);
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
