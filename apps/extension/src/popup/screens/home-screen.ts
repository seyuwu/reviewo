import { formatRatingStatsLine } from "../../content/rating-card/format-display.js";
import type { ExtensionEntityChildItem } from "../../shared/types/children.js";
import type { ExtensionResolveEntityBundle } from "../../shared/types/resolve.js";
import type { ActiveTabResolveState } from "../services/active-tab-resolve.js";
import { listRecentEntities } from "../services/recent-entities.js";
import { fetchEntityChildren } from "../services/entity-children.js";
import {
  getDomainTreeRoot,
  shortenCanonicalUrlForTree
} from "../domain-tree.js";
import type { EntityViewModel, RecentEntityRecord } from "../types.js";
import { buildEntityPageUrl, entityViewFromResolve, escapeHtml } from "../view-helpers.js";
import { entityViewFromChildItem } from "../domain-tree.js";

export interface HomeScreenActions {
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
  const currentPageMarkup = renderCurrentPageSection(activeTab);
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
      <section class="recent-section">
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

    actions.onOpenCurrentPage(entityViewFromResolve(activeTab.url, activeTab.result));
  });

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

function renderCurrentPageSection(activeTab: ActiveTabResolveState): string {
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
        <button type="button" class="secondary-button" data-open-current-page>Open page</button>
      </section>
    `;
  }

  return `
    <section class="current-page-card is-not-found">
      <h2>Current page</h2>
      <p class="status-line">Not in Reviewo yet</p>
      <p class="muted-copy">Search for it or open the page to rate it.</p>
      <button type="button" class="secondary-button" data-open-current-page>Open page</button>
    </section>
  `;
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
