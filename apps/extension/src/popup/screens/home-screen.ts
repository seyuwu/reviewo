import { formatRatingStatsLine } from "../../content/rating-card/format-display.js";
import { resolveMyEntityRatingScore } from "../../content/rating-card/resolve-my-entity-rating.js";
import { createGetAuthSessionMessage, ExtensionMessageType } from "../../shared/messages.js";
import { readExtensionPreferences } from "../../shared/extension-preferences-storage.js";
import { readPersistedEntityRatingByCanonical } from "../../shared/entity-rating-sync.js";
import type { ExtensionEntityChildItem } from "../../shared/types/children.js";
import type { ExtensionResolveEntityBundle, ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import type { ActiveTabResolveState } from "../services/active-tab-resolve.js";
import { listRecentEntities } from "../services/recent-entities.js";
import { fetchEntityChildren } from "../services/entity-children.js";
import { rateEntityViewModel } from "../services/rate-entity-view-model.js";
import {
  getDomainTreeRoot,
  shortenCanonicalUrlForTree
} from "../domain-tree.js";
import type { EntityViewModel, RecentEntityRecord } from "../types.js";
import { buildEntityPageUrl, entityViewFromResolve, escapeHtml } from "../view-helpers.js";
import { sendExtensionMessage } from "../services/popup-messaging.js";
import { entityViewFromChildItem } from "../domain-tree.js";
import {
  bindEntityReviewsSection,
  loadEntityReviewsSectionState,
  renderEntityReviewsSectionMarkup
} from "../entity-reviews-section.js";
import { renderPopupRatePanel } from "../popup-rate-panel.js";

export interface HomeScreenActions {
  onCurrentPageRated: () => void;
  onOpenChild: (entity: EntityViewModel) => void;
  onOpenCurrentPage: (entity: EntityViewModel) => void;
  onOpenRecent: (record: RecentEntityRecord) => void;
  onSearch: (query: string) => void;
}

export async function renderHomeScreen(
  container: HTMLElement,
  activeTab: ActiveTabResolveState,
  actions: HomeScreenActions
): Promise<void> {
  const recent = await listRecentEntities();
  const sessionResponse = await sendExtensionMessage<{
    payload?: { session?: { accessToken: string } | null };
    type?: string;
  }>(createGetAuthSessionMessage());
  const isAuthenticated =
    sessionResponse?.type === ExtensionMessageType.AuthSessionResult &&
    Boolean(sessionResponse.payload?.session?.accessToken);
  const currentUserId =
    sessionResponse?.type === ExtensionMessageType.AuthSessionResult
      ? sessionResponse.payload?.session?.userId
      : undefined;
  const preferences = await readExtensionPreferences();
  const currentPageMarkup = await renderCurrentPageSection(activeTab, isAuthenticated, preferences);
  const domainTree = await buildDomainTreeSection(activeTab);

  container.innerHTML = `
    <section class="screen home-screen">
      <form class="search-entry" data-home-search-form>
        <label class="field-label search-field-label">
          Search Reviewo
          <input
            name="query"
            type="search"
            placeholder="youtube, github, steam..."
            autocomplete="off"
          />
        </label>
        <button type="submit" class="primary-button">Search</button>
      </form>
      ${currentPageMarkup}
      ${domainTree.markup}
      <section class="recent-section card-section">
        <h2>Recent</h2>
        ${
          recent.length === 0
            ? `<p class="muted-copy">Pages you open will appear here.</p>`
            : `<ul class="entity-list">${recent
                .map(
                  (item) => `
              <li>
                <button type="button" class="entity-list-item" data-recent-id="${escapeHtml(item.id)}">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.slug)}</span>
                </button>
              </li>
            `
                )
                .join("")}</ul>`
        }
      </section>
    </section>
  `;

  container.querySelector("[data-home-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get("query");

    if (typeof query === "string" && query.trim()) {
      actions.onSearch(query.trim());
    }
  });

  container.querySelector("[data-open-current-page]")?.addEventListener("click", () => {
    if (!activeTab.result || !activeTab.url) {
      return;
    }

    actions.onOpenCurrentPage(
      entityViewFromResolve(activeTab.url, activeTab.result, activeTab.pageTitle)
    );
  });

  container.querySelectorAll<HTMLButtonElement>("[data-home-rate-score]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!activeTab.result || !activeTab.url) {
        return;
      }

      const score = Number(button.dataset.homeRateScore);

      if (!Number.isInteger(score)) {
        return;
      }

      void submitHomeRating(activeTab, score, container, actions);
    });
  });

  const reviewsHost = container.querySelector<HTMLElement>("[data-home-reviews-host]");

  if (
    reviewsHost &&
    activeTab.result?.status === "found" &&
    activeTab.result.entity.id
  ) {
    await mountHomeReviewsSection(
      reviewsHost,
      activeTab.result.entity.id,
      isAuthenticated,
      currentUserId,
      preferences
    );
  }

  container.querySelectorAll<HTMLButtonElement>("[data-recent-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = recent.find((item) => item.id === button.dataset.recentId);

      if (record) {
        actions.onOpenRecent(record);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-child-entity-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const child = domainTree.children.find((item) => item.entity.id === button.dataset.childEntityId);

      if (child) {
        const entity = entityViewFromChildItem(child);

        if (domainTree.treeRoot) {
          entity.parentEntityId = domainTree.treeRoot.entity.id;
          entity.parentEntityPagePath = domainTree.treeRoot.web.entityPagePath;
          entity.parentTitle = domainTree.treeRoot.entity.title;
        }

        actions.onOpenChild(entity);
      }
    });
  });
}

async function buildDomainTreeSection(activeTab: ActiveTabResolveState): Promise<{
  children: ExtensionEntityChildItem[];
  markup: string;
  treeRoot: ExtensionResolveEntityBundle | null;
}> {
  if (!activeTab.result || activeTab.result.status !== "found") {
    return { children: [], markup: "", treeRoot: null };
  }

  const treeRoot = getDomainTreeRoot(activeTab.result);

  if (!treeRoot) {
    return { children: [], markup: "", treeRoot: null };
  }

  try {
    const response = await fetchEntityChildren(treeRoot.entity.id);

    if (response.children.length === 0) {
      return { children: [], markup: "", treeRoot };
    }

    const parentStatsLabel = formatRatingStatsLine(
      treeRoot.rating.avgScore,
      treeRoot.rating.votesCount
    );
    const currentEntityId = activeTab.result.entity.id;

    return {
      children: response.children,
      markup: `
        <section class="domain-tree-section">
          <h2>On this site</h2>
          <div class="domain-tree-header">
            <p><strong>${escapeHtml(treeRoot.entity.title)}</strong></p>
            <p class="muted-copy">${escapeHtml(parentStatsLabel)}</p>
            <a class="text-link" href="${escapeHtml(buildEntityPageUrl(treeRoot.web.entityPagePath))}" target="_blank" rel="noopener noreferrer">Open site page</a>
          </div>
          <ul class="domain-tree">
            ${response.children
              .map((child, index) => renderDomainTreeItem(child, index, response.children.length, currentEntityId))
              .join("")}
          </ul>
        </section>
      `,
      treeRoot
    };
  } catch {
    return { children: [], markup: "", treeRoot };
  }
}

function renderDomainTreeItem(
  child: ExtensionEntityChildItem,
  index: number,
  total: number,
  currentEntityId: string
): string {
  const isCurrent = child.entity.id === currentEntityId;
  const branch = index === total - 1 ? "└" : "├";
  const title = child.entity.title || shortenCanonicalUrlForTree(child.entity.canonicalUrl);
  const pathLabel = shortenCanonicalUrlForTree(child.entity.canonicalUrl);
  const metaLabel = formatRatingStatsLine(child.rating.avgScore, child.rating.votesCount);

  return `
    <li>
      <button
        type="button"
        class="domain-tree-item${isCurrent ? " is-current" : ""}"
        data-child-entity-id="${escapeHtml(child.entity.id)}"
      >
        <span class="domain-tree-branch" aria-hidden="true">${branch}</span>
        <span class="domain-tree-copy">
          <strong>${escapeHtml(title)}</strong>
          <span class="muted-copy">${escapeHtml(pathLabel)}</span>
          <span class="domain-tree-meta">${escapeHtml(metaLabel)}</span>
        </span>
      </button>
    </li>
  `;
}

function renderCurrentPageSection(
  activeTab: ActiveTabResolveState,
  isAuthenticated: boolean,
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>
): Promise<string> {
  return buildCurrentPageSectionMarkup(activeTab, isAuthenticated, preferences);
}

async function buildCurrentPageSectionMarkup(
  activeTab: ActiveTabResolveState,
  isAuthenticated: boolean,
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>
): Promise<string> {
  if (!activeTab.url) {
    return `
      <section class="current-page-card">
        <h2>Current page</h2>
        <p class="muted-copy">Open a normal website tab to see its Reviewo status.</p>
      </section>
    `;
  }

  if (!activeTab.result) {
    return `
      <section class="current-page-card">
        <h2>Current page</h2>
        <p class="muted-copy">This page cannot be resolved by Reviewo.</p>
      </section>
    `;
  }

  const myRatingScore = await resolveCurrentPageMyRating(activeTab, isAuthenticated);
  const ratePanelMarkup = renderPopupRatePanel({
    isAuthenticated,
    myRatingScore,
    rateScoreDataAttribute: "data-home-rate-score",
    statusSelector: 'data-home-rate-status'
  });
  const reviewsHostMarkup =
    activeTab.result.status === "found"
      ? `<div class="home-reviews-host" data-home-reviews-host hidden></div>`
      : "";

  if (activeTab.result.status === "found") {
    const parentMarkup = renderParentSiteSection(activeTab.result);
    const ratingLine = formatRatingStatsLine(
      activeTab.result.rating.avgScore,
      activeTab.result.rating.votesCount
    );

    return `
      <section class="current-page-card is-found">
        <h2>Current page</h2>
        <p class="status-line success-line">✓ ${escapeHtml(activeTab.result.entity.title)} found</p>
        <p class="muted-copy${activeTab.result.rating.votesCount === 0 ? " emphasis-copy" : ""}">${escapeHtml(ratingLine)}</p>
        ${parentMarkup}
        ${ratePanelMarkup}
        ${reviewsHostMarkup}
        <button type="button" class="secondary-button" data-open-current-page>Open page</button>
      </section>
    `;
  }

  return `
    <section class="current-page-card is-not-found">
      <h2>Current page</h2>
      <p class="status-line">Not in Reviewo yet</p>
      <p class="muted-copy">Rate it here if you missed the on-page card.</p>
      ${ratePanelMarkup}
      ${reviewsHostMarkup}
      <button type="button" class="secondary-button" data-open-current-page>Open page</button>
    </section>
  `;
}

async function resolveCurrentPageMyRating(
  activeTab: ActiveTabResolveState,
  isAuthenticated: boolean
): Promise<number | null> {
  if (!isAuthenticated || !activeTab.result) {
    return null;
  }

  if (activeTab.result.status === "found") {
    return resolveMyEntityRatingScore(activeTab.result.entity.id);
  }

  const persisted = await readPersistedEntityRatingByCanonical(activeTab.result.url.canonical);

  return persisted?.score ?? null;
}

async function mountHomeReviewsSection(
  host: HTMLElement,
  entityId: string,
  isAuthenticated: boolean,
  currentUserId: string | undefined,
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>
): Promise<void> {
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

async function submitHomeRating(
  activeTab: ActiveTabResolveState,
  score: number,
  container: HTMLElement,
  actions: HomeScreenActions
): Promise<void> {
  if (!activeTab.result || !activeTab.url) {
    return;
  }

  const statusElement = container.querySelector<HTMLParagraphElement>("[data-home-rate-status]");

  if (statusElement) {
    statusElement.hidden = false;
    statusElement.textContent = "Saving rating...";
    statusElement.classList.remove("status-copy-error", "status-copy-success");
  }

  const entity = entityViewFromResolve(activeTab.url, activeTab.result, activeTab.pageTitle);
  const result = await rateEntityViewModel(entity, score);

  if (result.updated) {
    if (statusElement) {
      statusElement.hidden = false;
      statusElement.textContent = "Rating saved.";
      statusElement.classList.remove("status-copy-error");
      statusElement.classList.add("status-copy-success");
    }

    actions.onCurrentPageRated();
    return;
  }

  if (statusElement) {
    statusElement.hidden = false;
    statusElement.textContent = result.errorMessage ?? "Could not save rating.";
    statusElement.classList.remove("status-copy-success");
    statusElement.classList.add("status-copy-error");
  }
}

function renderParentSiteSection(result: ExtensionResolveFoundResponse): string {
  if (!result.parent) {
    return "";
  }

  const parentStatsLabel = formatRatingStatsLine(
    result.parent.rating.avgScore,
    result.parent.rating.votesCount
  );

  return `
    <div class="parent-site-row">
      <p class="parent-site-label">Parent site</p>
      <p><strong>${escapeHtml(result.parent.entity.title)}</strong></p>
      <p class="muted-copy">${escapeHtml(parentStatsLabel)}</p>
      <a class="text-link" href="${escapeHtml(buildEntityPageUrl(result.parent.web.entityPagePath))}" target="_blank" rel="noopener noreferrer">Open parent page</a>
    </div>
  `;
}
