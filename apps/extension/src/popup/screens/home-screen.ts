import { resolveCardDisplayTitle } from "../../content/rating-card/card-page-title.js";
import { formatRatingStatsLine, formatRatingStatsLineWithConfidence } from "../../content/rating-card/format-display.js";
import { resolveMyEntityRatingScore } from "../../content/rating-card/resolve-my-entity-rating.js";
import type { TranslateFn } from "@reviewo/i18n";
import { createExtensionTranslator } from "../../shared/extension-i18n.js";
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
import { bindAuthPromptTriggers } from "../bind-auth-prompt-triggers.js";
import { sendExtensionMessage } from "../services/popup-messaging.js";
import { entityViewFromChildItem } from "../domain-tree.js";
import {
  bindEntityReviewsSection,
  loadEntityReviewsSectionState,
  renderEntityReviewsSectionMarkup
} from "../entity-reviews-section.js";
import { renderPopupRatePanel } from "../popup-rate-panel.js";
import {
  bindChatDrawerToggle,
  renderChatDrawerSectionMarkup
} from "../components/chat-drawer.js";
import {
  mountActiveNowPanel,
  renderActiveNowHostMarkup
} from "../components/active-now-panel.js";
import type { ActiveNowItem } from "../services/entity-chat-api.js";
import { bindEntityAvatars, renderEntityAvatarMarkup } from "../lib/entity-avatar.js";

export interface HomeScreenActions {
  onCurrentPageRated: () => void;
  onOpenActiveEntity?: (item: ActiveNowItem) => void;
  onOpenChild: (entity: EntityViewModel) => void;
  onOpenCurrentPage: (entity: EntityViewModel) => void;
  onOpenRecent: (record: RecentEntityRecord) => void;
  onOpenSearchScreen: () => void;
  onRequestSignIn: () => void;
  onSearch: (query: string) => void;
}

export async function renderHomeScreen(
  container: HTMLElement,
  activeTab: ActiveTabResolveState,
  actions: HomeScreenActions
): Promise<void> {
  const t = await createExtensionTranslator();
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
  const currentPageMarkup = await renderCurrentPageSection(activeTab, isAuthenticated, preferences, t);
  const domainTree = await buildDomainTreeSection(activeTab, t);
  const recentMarkup = renderRecentSection(recent, t);

  container.innerHTML = `
    <section class="screen home-screen">
      ${currentPageMarkup}
      ${domainTree.markup}
      <details class="home-collapsible">
        <summary>${escapeHtml(t("popup.home.collapsible.activeNow"))}</summary>
        ${renderActiveNowHostMarkup()}
      </details>
      <details class="home-collapsible">
        <summary>${escapeHtml(t("popup.home.collapsible.recent"))}</summary>
        ${recentMarkup}
      </details>
      <div class="home-search-footer">
        <button type="button" class="text-link-button" data-open-search-screen>
          ${escapeHtml(t("home.openSearchLink"))}
        </button>
      </div>
    </section>
  `;

  bindEntityAvatars(container);

  container.querySelector("[data-open-search-screen]")?.addEventListener("click", () => {
    actions.onOpenSearchScreen();
  });

  container.querySelector("[data-open-current-page]")?.addEventListener("click", () => {
    if (!activeTab.result || !activeTab.url) {
      return;
    }

    actions.onOpenCurrentPage(
      entityViewFromResolve(activeTab.url, activeTab.result, activeTab.pageTitle)
    );
  });

  container.querySelector("[data-open-chat-discuss]")?.addEventListener("click", () => {
    const chatToggle = container.querySelector<HTMLButtonElement>("[data-chat-toggle]");

    if (!chatToggle || chatToggle.getAttribute("aria-expanded") === "true") {
      return;
    }

    chatToggle.click();
  });

  container.querySelector("[data-open-compare]")?.addEventListener("click", () => {
    if (activeTab.result?.status !== "found") {
      return;
    }

    const compareUrl = `${buildEntityPageUrl(activeTab.result.web.entityPagePath)}#entity-compare`;
    window.open(compareUrl, "_blank", "noopener,noreferrer");
  });

  container.querySelectorAll<HTMLButtonElement>("[data-home-rate-score]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAuthenticated) {
        actions.onRequestSignIn();
        return;
      }

      if (!activeTab.result || !activeTab.url) {
        return;
      }

      const score = Number(button.dataset.homeRateScore);

      if (!Number.isInteger(score)) {
        return;
      }

      void submitHomeRating(activeTab, score, container, actions, t);
    });
  });

  bindAuthPromptTriggers(container, actions.onRequestSignIn);

  const reviewsHost = container.querySelector<HTMLElement>("[data-home-reviews-host]");

  if (activeTab.result?.status === "found" && activeTab.result.entity.id) {
    await mountHomeReviewsSection(
      reviewsHost,
      activeTab.result.entity.id,
      isAuthenticated,
      currentUserId,
      preferences,
      t
    );
  }

  if (activeTab.result?.status === "found" && activeTab.result.entity.id) {
    mountHomeChatSection(
      container,
      activeTab.result.entity.id,
      activeTab.result.entity.title,
      isAuthenticated,
      sessionResponse?.type === ExtensionMessageType.AuthSessionResult
        ? sessionResponse.payload?.session?.accessToken ?? null
        : null,
      currentUserId,
      t,
      actions
    );
  }

  void mountActiveNowPanel(
    container.querySelector<HTMLElement>("[data-active-now-host]"),
    t,
    actions.onOpenActiveEntity
  );

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

function renderRecentSection(recent: RecentEntityRecord[], t: TranslateFn): string {
  if (recent.length === 0) {
    return `<section class="recent-section card-section"><p class="muted-copy">${escapeHtml(t("home.recent.empty"))}</p></section>`;
  }

  return `
    <section class="recent-section card-section">
      <ul class="entity-list">${recent
        .map((item) => {
          const hostname = formatHostname(item.canonicalUrl) ?? item.slug;

          return `
            <li>
              <button type="button" class="entity-list-item entity-list-item-with-avatar" data-recent-id="${escapeHtml(item.id)}">
                ${renderEntityAvatarMarkup({
                  canonicalUrl: item.canonicalUrl,
                  entityId: item.id,
                  size: "sm",
                  title: item.title
                })}
                <span class="entity-list-item-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span class="muted-copy">${escapeHtml(hostname)}</span>
                </span>
              </button>
            </li>
          `;
        })
        .join("")}</ul>
    </section>
  `;
}

async function buildDomainTreeSection(
  activeTab: ActiveTabResolveState,
  t: TranslateFn
): Promise<{
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

    const parentStatsLabel = formatRatingStatsLineWithConfidence(
      t,
      treeRoot.rating.avgScore,
      treeRoot.rating.votesCount,
      treeRoot.trust
    );
    const currentEntityId = activeTab.result.entity.id;

    return {
      children: response.children,
      markup: `
        <section class="domain-tree-section">
          <h2>${escapeHtml(t("home.domainTree.title"))}</h2>
          <div class="domain-tree-header">
            <p><strong>${escapeHtml(treeRoot.entity.title)}</strong></p>
            <p class="muted-copy">${escapeHtml(parentStatsLabel)}</p>
            <a class="text-link" href="${escapeHtml(buildEntityPageUrl(treeRoot.web.entityPagePath))}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("home.domainTree.openSitePage"))}</a>
          </div>
          <ul class="domain-tree">
            ${response.children
              .map((child, index) => renderDomainTreeItem(child, index, response.children.length, currentEntityId, t))
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
  currentEntityId: string,
  t: TranslateFn
): string {
  const isCurrent = child.entity.id === currentEntityId;
  const branch = index === total - 1 ? "└" : "├";
  const title = child.entity.title || shortenCanonicalUrlForTree(child.entity.canonicalUrl);
  const pathLabel = shortenCanonicalUrlForTree(child.entity.canonicalUrl);
  const metaLabel = formatRatingStatsLine(t, child.rating.avgScore, child.rating.votesCount);

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
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>,
  t: TranslateFn
): Promise<string> {
  return buildCurrentPageSectionMarkup(activeTab, isAuthenticated, preferences, t);
}

async function buildCurrentPageSectionMarkup(
  activeTab: ActiveTabResolveState,
  isAuthenticated: boolean,
  preferences: Awaited<ReturnType<typeof readExtensionPreferences>>,
  t: TranslateFn
): Promise<string> {
  if (!activeTab.url) {
    return `
      <section class="current-page-card">
        <p class="muted-copy">${escapeHtml(t("home.currentPage.noTab"))}</p>
      </section>
    `;
  }

  if (!activeTab.result) {
    return `
      <section class="current-page-card">
        <p class="muted-copy">${escapeHtml(t("home.currentPage.unresolved"))}</p>
      </section>
    `;
  }

  const displayTitle = resolveCardDisplayTitle(activeTab.result, activeTab.pageTitle);
  const canonicalUrl = activeTab.result.url.canonical;
  const hostname = formatHostname(canonicalUrl);
  const entityId = activeTab.result.status === "found" ? activeTab.result.entity.id : undefined;
  const myRatingScore = await resolveCurrentPageMyRating(activeTab, isAuthenticated);
  const ratePanelMarkup = renderPopupRatePanel(t, {
    isAuthenticated,
    myRatingScore,
    rateScoreDataAttribute: "data-home-rate-score",
    showLabel: false,
    statusSelector: "data-home-rate-status"
  });
  const avatarMarkup = renderEntityAvatarMarkup({
    canonicalUrl,
    ...(entityId ? { entityId } : {}),
    size: "lg",
    title: displayTitle
  });
  const reviewsDetailsMarkup =
    activeTab.result.status === "found"
      ? `
        <details class="home-collapsible home-reviews-collapsible">
          <summary>${escapeHtml(t("popup.home.collapsible.reviews"))}</summary>
          <div class="home-reviews-host home-reviews-host-primary" data-home-reviews-host hidden></div>
        </details>
      `
      : "";
  const actionButtonsMarkup = renderCurrentPageActions(activeTab, t);

  if (activeTab.result.status === "found") {
    const parentMarkup = renderParentSiteSection(activeTab.result, t);
    const ratingLine = formatRatingStatsLineWithConfidence(
      t,
      activeTab.result.rating.avgScore,
      activeTab.result.rating.votesCount,
      activeTab.result.trust
    );

    return `
      <section class="current-page-card is-found">
        <div class="current-page-card-scroll">
          <div class="current-page-hero">
            ${avatarMarkup}
            <div class="current-page-hero-copy">
              <h2 class="current-page-hero-title">${escapeHtml(displayTitle)}</h2>
              ${hostname ? `<p class="current-page-hero-hostname">${escapeHtml(hostname)}</p>` : ""}
              <p class="current-page-hero-rating${activeTab.result.rating.votesCount === 0 ? " emphasis-copy" : ""}">${escapeHtml(ratingLine)}</p>
            </div>
          </div>
          ${parentMarkup}
          ${ratePanelMarkup}
          ${actionButtonsMarkup}
          ${reviewsDetailsMarkup}
        </div>
        <div class="home-chat-actions" data-home-chat-actions hidden></div>
      </section>
    `;
  }

  return `
    <section class="current-page-card is-not-found">
      <div class="current-page-card-scroll">
        <div class="current-page-hero">
          ${avatarMarkup}
          <div class="current-page-hero-copy">
            <h2 class="current-page-hero-title">${escapeHtml(displayTitle)}</h2>
            ${hostname ? `<p class="current-page-hero-hostname">${escapeHtml(hostname)}</p>` : ""}
            <p class="status-line">${escapeHtml(t("home.currentPage.notFound"))}</p>
            <p class="muted-copy">${escapeHtml(t("home.currentPage.notFoundHint"))}</p>
          </div>
        </div>
        ${ratePanelMarkup}
        ${actionButtonsMarkup}
      </div>
    </section>
  `;
}

function renderCurrentPageActions(activeTab: ActiveTabResolveState, t: TranslateFn): string {
  const isFound = activeTab.result?.status === "found";

  return `
    <div class="current-page-actions">
      <button type="button" class="secondary-button" data-open-current-page>
        ${escapeHtml(t("popup.currentPage.openInOpinia"))}
      </button>
      ${
        isFound
          ? `
        <button type="button" class="text-link-button" data-open-chat-discuss>
          ${escapeHtml(t("growth.hero.discuss"))}
        </button>
        <button type="button" class="text-link-button" data-open-compare>
          ${escapeHtml(t("growth.hero.compare"))}
        </button>
      `
          : ""
      }
    </div>
  `;
}

function formatHostname(canonicalUrl: string | null): string | null {
  if (!canonicalUrl) {
    return null;
  }

  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
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

async function submitHomeRating(
  activeTab: ActiveTabResolveState,
  score: number,
  container: HTMLElement,
  actions: HomeScreenActions,
  t: TranslateFn
): Promise<void> {
  if (!activeTab.result || !activeTab.url) {
    return;
  }

  const statusElement = container.querySelector<HTMLParagraphElement>("[data-home-rate-status]");

  if (statusElement) {
    statusElement.hidden = false;
    statusElement.textContent = t("rating.saving");
    statusElement.classList.remove("status-copy-error", "status-copy-success");
  }

  const entity = entityViewFromResolve(activeTab.url, activeTab.result, activeTab.pageTitle);
  const result = await rateEntityViewModel(entity, score);

  if (result.updated) {
    if (statusElement) {
      statusElement.hidden = false;
      statusElement.textContent = t("rating.saved");
      statusElement.classList.remove("status-copy-error");
      statusElement.classList.add("status-copy-success");
    }

    actions.onCurrentPageRated();
    return;
  }

  if (statusElement) {
    statusElement.hidden = false;
    statusElement.textContent = result.errorMessage ?? t("rating.saveError");
    statusElement.classList.remove("status-copy-success");
    statusElement.classList.add("status-copy-error");
  }
}

function mountHomeChatSection(
  container: HTMLElement,
  entityId: string,
  entityTitle: string,
  isAuthenticated: boolean,
  accessToken: string | null,
  currentUserId: string | undefined,
  t: TranslateFn,
  actions: HomeScreenActions
): void {
  const host = container.querySelector<HTMLElement>("[data-home-chat-actions]");

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

function renderParentSiteSection(result: ExtensionResolveFoundResponse, t: TranslateFn): string {
  if (!result.parent) {
    return "";
  }

  const parentStatsLabel = formatRatingStatsLineWithConfidence(
    t,
    result.parent.rating.avgScore,
    result.parent.rating.votesCount,
    result.parent.trust
  );

  return `
    <div class="parent-site-row">
      <p class="parent-site-label">${escapeHtml(t("home.parentSite.label"))}</p>
      <p><strong>${escapeHtml(result.parent.entity.title)}</strong></p>
      <p class="muted-copy">${escapeHtml(parentStatsLabel)}</p>
      <a class="text-link" href="${escapeHtml(buildEntityPageUrl(result.parent.web.entityPagePath))}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("home.parentSite.openLink"))}</a>
    </div>
  `;
}
