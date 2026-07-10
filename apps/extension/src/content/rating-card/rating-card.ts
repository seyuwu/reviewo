import {
  addStorageChangedListener,
  guardExtensionContext,
  markExtensionContextInvalidated,
  removeStorageChangedListener
} from "../extension-context.js";
import {
  readExtensionPreferences,
  saveExtensionPreferences
} from "../../shared/extension-preferences-storage.js";
import type { ContentLocaleParam } from "@reviewo/shared";

import type { ExtensionUserPreferences } from "../../shared/preferences.js";
import { resolveExtensionContentLocale, resolveReviewsContentLocale } from "../../shared/content-locale.js";
import { extensionConfig } from "../../shared/config.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import type { ExtensionResolveResponse } from "../../shared/types/resolve.js";
import { hasAuthenticatedExtensionSession, getExtensionSessionAccessToken, getExtensionSessionUserId } from "./auth-session-state.js";
import { ENTITY_RATINGS_STORAGE_KEY, readPersistedEntityRatingByCanonical, readPersistedEntityRatingEntry } from "../../shared/entity-rating-sync.js";
import { mergeQuickRatingIntoFoundResponse } from "../../shared/merge-rating-response.js";
import { publishEntityRatingUpdate } from "../../shared/publish-entity-rating-update.js";
import { applyCardPlacement } from "./card-placement.js";
import { bindAutoDismiss, bindOutsideDismiss, clearAutoDismiss, unbindAutoDismiss, unbindOutsideDismiss } from "./auto-dismiss.js";
import { buildCardDisplayContext, getRateTargetEntityId } from "./card-display.js";
import { installCardResponsiveScale } from "./card-responsive-scale.js";
import { installCardTitleRefresh, resolveCardDisplayTitle } from "./card-page-title.js";
import { isPageContentReadyForCard, waitForPageContentReady } from "./page-content-ready.js";
import { toFoundResponseFromByUrlRating } from "./convert-by-url-rating.js";
import { fetchMyEntityReview } from "./fetch-my-entity-review.js";
import { fetchEntityReviews } from "./fetch-entity-reviews.js";
import type { CardEntityReview } from "./fetch-entity-reviews.js";
import {
  bindCardCommunityReviews,
  renderCardCommunityReviewsMarkup,
  type CardCommunityReviewsState,
  type CardReviewSort
} from "./card-community-reviews.js";
import { resolveMyEntityRatingScore } from "./resolve-my-entity-rating.js";
import { readPageSourceTitle } from "./read-page-title.js";
import { RATING_CARD_STYLES } from "./rating-card-styles.js";
import { submitEntityRating } from "./submit-entity-rating.js";
import { submitEntityRatingByUrl } from "./submit-entity-rating-by-url.js";
import { bindSiteSnoozePanel, renderSiteSnoozePanelMarkup } from "./site-snooze-panel.js";
import {
  bindCardAuthPanel,
  renderCardAuthPanelMarkup,
  type CardAuthMode
} from "./card-auth-panel.js";
import {
  bindCardSettingsTip,
  renderCardSettingsTipMarkup
} from "./card-settings-tip.js";
import { showDisableEverywhereFeedback } from "./card-disable-everywhere-feedback.js";
import {
  bindCardPinButton,
  renderCardPinButtonMarkup,
  setRatingCardPinned
} from "./card-pin.js";
import {
  bindCardChatDrawer,
  clearCardChatDrawerState,
  renderCardChatSectionMarkup
} from "./card-chat-drawer.js";
import { requestDismissRatingCard, requestMarkEntityRatedOnTab, readRatingCardSessionKey, isResolveResultForCurrentPage } from "./rating-card-session.js";
import { isOnSiteCardTipDismissed } from "../../shared/extension-onboarding-storage.js";
import { createExtensionTranslatorFromPreference } from "../../shared/extension-i18n.js";
import { formatRatingCardHotkeyLabel } from "../../shared/rating-card-hotkey.js";
import type { TranslateFn } from "@reviewo/i18n";

const RATING_CARD_HOST_ID = "reviewo-rating-card-host";
const RATING_CARD_ROOT_CLASS = "reviewo-rating-card-root";
const RATING_SCORES = [1, 2, 3, 4, 5] as const;

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

type RatingCardHost = HTMLElement & {
  reviewoIsClosing?: boolean;
  reviewoCloseFinishTimer?: number;
  reviewoStorageListener?: StorageListener;
  reviewoTitleRefreshCleanup?: () => void;
  reviewoResponsiveScaleCleanup?: () => void;
  reviewoAutoDismissPendingCleanup?: () => void;
};

let activeRatingCardLocaleRefresh: (() => void) | null = null;

export function refreshVisibleRatingCardLocale(): void {
  activeRatingCardLocaleRefresh?.();
}

export interface HideRatingCardOptions {
  animated?: boolean;
}

export function hideRatingCard(options: HideRatingCardOptions = {}): void {
  const hosts = findAllRatingCardHosts();

  if (hosts.length === 0) {
    return;
  }

  const forceRemove = options.animated === false;

  for (const host of hosts) {
    hideSingleRatingCardHost(host, options, forceRemove);
  }
}

export function isRatingCardVisible(): boolean {
  return findAllRatingCardHosts().some((host) => !host.reviewoIsClosing);
}

export function removeAllRatingCardHosts(): void {
  for (const host of findAllRatingCardHosts()) {
    removeRatingCardHost(host);
  }

  activeRatingCardLocaleRefresh = null;
}

function findAllRatingCardHosts(): RatingCardHost[] {
  return Array.from(document.querySelectorAll(`#${RATING_CARD_HOST_ID}`)) as RatingCardHost[];
}

function hideSingleRatingCardHost(
  host: RatingCardHost,
  options: HideRatingCardOptions,
  forceRemove: boolean
): void {
  if (host.reviewoIsClosing) {
    if (forceRemove) {
      cancelCloseAnimation(host);
      removeRatingCardHost(host);
    }

    return;
  }

  const shouldAnimate = options.animated !== false;
  const shellElement = host.shadowRoot?.querySelector<HTMLElement>(".reviewo-card-shell");

  if (shouldAnimate && shellElement) {
    host.reviewoIsClosing = true;
    unbindAutoDismiss(host);
    unbindOutsideDismiss(host);
    clearAutoDismiss(host);
    shellElement.classList.remove("is-entering");
    shellElement.classList.add("is-closing");

    let finished = false;
    const finishRemoval = (): void => {
      if (finished) {
        return;
      }

      finished = true;
      cancelCloseAnimation(host);
      removeRatingCardHost(host);
    };

    shellElement.addEventListener(
      "animationend",
      (event) => {
        if (event.target === shellElement) {
          finishRemoval();
        }
      },
      { once: true }
    );

    host.reviewoCloseFinishTimer = window.setTimeout(finishRemoval, 320);
    return;
  }

  removeRatingCardHost(host);
}

function cancelCloseAnimation(host: RatingCardHost): void {
  if (host.reviewoCloseFinishTimer !== undefined) {
    window.clearTimeout(host.reviewoCloseFinishTimer);
    host.reviewoCloseFinishTimer = undefined;
  }

  host.reviewoIsClosing = false;
}

function removeRatingCardHost(host: RatingCardHost): void {
  clearCardChatDrawerState();

  if (host.reviewoStorageListener) {
    removeStorageChangedListener(host.reviewoStorageListener);
  }

  if (host.reviewoTitleRefreshCleanup) {
    host.reviewoTitleRefreshCleanup();
  }

  if (host.reviewoResponsiveScaleCleanup) {
    host.reviewoResponsiveScaleCleanup();
  }

  unbindAutoDismiss(host);
  unbindOutsideDismiss(host);
  clearAutoDismiss(host);
  host.remove();
}

export async function showRatingCard(
  resolveResponse: ExtensionResolveResponse,
  preferences: ExtensionUserPreferences
): Promise<void> {
  if (!isResolveResultForCurrentPage(resolveResponse)) {
    return;
  }

  removeAllRatingCardHosts();

  const host = document.createElement("div");
  host.id = RATING_CARD_HOST_ID;
  host.className = RATING_CARD_ROOT_CLASS;
  applyCardPlacement(host, preferences.cardPlacement);

  let t = createExtensionTranslatorFromPreference(preferences.locale);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleElement = document.createElement("style");
  styleElement.textContent = RATING_CARD_STYLES;

  const shellElement = document.createElement("div");
  shellElement.className = "reviewo-card-shell is-preparing";

  const cardElement = document.createElement("article");
  cardElement.className = "reviewo-card";
  cardElement.setAttribute("role", "complementary");
  cardElement.setAttribute("aria-label", t("card.ariaLabel"));

  shellElement.append(cardElement);
  shadowRoot.append(styleElement, shellElement);
  document.documentElement.append(host);

  const cardState: {
    accessToken: string | null;
    authMode: CardAuthMode;
    cachedPageTitle?: string;
    cardView: "auth" | "main";
    currentUserId?: string;
    isAuthenticated: boolean;
    isSubmitting: boolean;
    myRatingScore: number | null;
    myReviewText: string | null;
    myReviewUpdatedAt: string | null;
    pendingRatingScore: number | null;
    resolveResponse: ExtensionResolveResponse;
    reviewDisplayMode: ExtensionUserPreferences["popupReviewDisplayMode"];
    reviews: CardEntityReview[];
    reviewsError: string | null;
    reviewsLimit: number;
    reviewsSort: CardReviewSort;
    activeReviewIndex: number;
    settingsTipHotkeyEnabled: boolean;
    settingsTipHotkeyLabel: string;
    showSettingsTip: boolean;
    onSiteRatingCardEnabled: boolean;
    isPinned: boolean;
    localePreference: ExtensionUserPreferences["locale"];
    showAllReviews: boolean;
  } = {
    accessToken: null,
    authMode: "register",
    cardView: "main",
    isAuthenticated: false,
    isSubmitting: false,
    myRatingScore: null,
    myReviewText: null,
    myReviewUpdatedAt: null,
    pendingRatingScore: null,
    resolveResponse,
    reviewDisplayMode: preferences.popupReviewDisplayMode,
    reviews: [],
    reviewsError: null,
    reviewsLimit: preferences.popupReviewsLimit,
    reviewsSort: "likes",
    activeReviewIndex: 0,
    settingsTipHotkeyEnabled: preferences.ratingCardHotkeyEnabled,
    settingsTipHotkeyLabel: formatRatingCardHotkeyLabel(preferences.ratingCardHotkey, t),
    showSettingsTip: false,
    onSiteRatingCardEnabled: preferences.onSiteRatingCardEnabled,
    isPinned: false,
    localePreference: preferences.locale,
    showAllReviews: false
  };

  let isCardContentReady = false;

  function readMyReviewLocale(): ContentLocaleParam {
    return resolveExtensionContentLocale(cardState.localePreference);
  }

  function readReviewsListLocale(): ContentLocaleParam {
    return resolveReviewsContentLocale(cardState.localePreference, cardState.showAllReviews);
  }

  async function reloadCommunityReviews(): Promise<void> {
    if (cardState.resolveResponse.status !== "found") {
      return;
    }

    const entityId = getRateTargetEntityId(cardState.resolveResponse);
    cardState.reviewsError = null;

    if (cardState.isAuthenticated) {
      const [myReview, reviewsResult] = await Promise.all([
        fetchMyEntityReview(entityId, readMyReviewLocale()),
        fetchEntityReviews(entityId, true, readReviewsListLocale())
      ]);

      cardState.myReviewText = myReview?.text ?? null;
      cardState.myReviewUpdatedAt = myReview?.updatedAt ?? null;

      if (reviewsResult.errorMessage) {
        cardState.reviewsError = reviewsResult.errorMessage;
      } else {
        cardState.reviews = reviewsResult.reviews ?? [];
      }
    } else {
      const reviewsResult = await fetchEntityReviews(entityId, false, readReviewsListLocale());

      if (reviewsResult.errorMessage) {
        cardState.reviewsError = reviewsResult.errorMessage;
      } else {
        cardState.reviews = reviewsResult.reviews ?? [];
      }
    }

    cardState.activeReviewIndex = 0;

    if (isCardContentReady) {
      renderCard();
    }
  }

  function isCardStillRelevant(): boolean {
    return (
      document.contains(host) &&
      isResolveResultForCurrentPage(cardState.resolveResponse)
    );
  }

  async function refreshAuthState(): Promise<void> {
    cardState.isAuthenticated = await hasAuthenticatedExtensionSession();
    cardState.accessToken = cardState.isAuthenticated ? await getExtensionSessionAccessToken() : null;
    cardState.currentUserId = cardState.isAuthenticated
      ? await getExtensionSessionUserId()
      : undefined;

    cardState.myReviewText = null;
    cardState.myReviewUpdatedAt = null;
    cardState.reviews = [];
    cardState.reviewsError = null;

    if (cardState.isAuthenticated) {
      if (cardState.resolveResponse.status === "found") {
        const entityId = getRateTargetEntityId(cardState.resolveResponse);
        const [myRatingScore, myReview, reviewsResult] = await Promise.all([
          resolveMyEntityRatingScore(entityId),
          fetchMyEntityReview(entityId, readMyReviewLocale()),
          fetchEntityReviews(entityId, true, readReviewsListLocale())
        ]);
        cardState.myRatingScore = myRatingScore;
        cardState.myReviewText = myReview?.text ?? null;
        cardState.myReviewUpdatedAt = myReview?.updatedAt ?? null;

        if (reviewsResult.errorMessage) {
          cardState.reviewsError = reviewsResult.errorMessage;
        } else {
          cardState.reviews = reviewsResult.reviews ?? [];
        }

        const persisted = await readPersistedEntityRatingEntry(entityId);

        if (
          persisted &&
          typeof persisted.avgScore === "number" &&
          typeof persisted.votesCount === "number"
        ) {
          cardState.resolveResponse = {
            ...cardState.resolveResponse,
            rating: {
              ...cardState.resolveResponse.rating,
              avgScore: persisted.avgScore,
              votesCount: persisted.votesCount
            }
          };
        }
      } else {
        const persisted = await readPersistedEntityRatingByCanonical(
          cardState.resolveResponse.url.canonical
        );
        cardState.myRatingScore = persisted?.score ?? null;
      }
    } else {
      cardState.myRatingScore = null;
      cardState.myReviewText = null;
      cardState.myReviewUpdatedAt = null;
      cardState.currentUserId = undefined;

      if (cardState.resolveResponse.status === "found") {
        const entityId = getRateTargetEntityId(cardState.resolveResponse);
        const reviewsResult = await fetchEntityReviews(entityId, false, readReviewsListLocale());

        if (reviewsResult.errorMessage) {
          cardState.reviewsError = reviewsResult.errorMessage;
        } else {
          cardState.reviews = reviewsResult.reviews ?? [];
        }
      }
    }

    if (isCardContentReady) {
      renderCard();
    }
  }

  function getCommunityReviewsState(): CardCommunityReviewsState {
    const hasCurrentUserReview = Boolean(cardState.myReviewText?.trim());

    return {
      currentUserId: cardState.currentUserId,
      displayMode: cardState.reviewDisplayMode,
      entityId: cardState.resolveResponse.status === "found" ? cardState.resolveResponse.entity.id : "",
      hasCurrentUserReview,
      isAuthenticated: cardState.isAuthenticated,
      myReviewText: cardState.myReviewText ?? "",
      reviews: cardState.reviews,
      reviewsLimit: cardState.reviewsLimit,
      sort: cardState.reviewsSort,
      contentLocale: resolveExtensionContentLocale(cardState.localePreference),
      showAllReviews: cardState.showAllReviews
    };
  }

  function readCardPageTitle(): string | undefined {
    const pageTitle = readPageSourceTitle(cardState.resolveResponse.url.input);

    if (pageTitle) {
      cardState.cachedPageTitle = pageTitle;
    }

    return pageTitle ?? cardState.cachedPageTitle;
  }

  function syncCardPinDismissBehavior(cardHost: RatingCardHost): void {
    setRatingCardPinned(cardHost, cardState.isPinned);
  }

  function renderCard(): void {
    if (!isCardContentReady || !isCardStillRelevant()) {
      if (!isCardStillRelevant()) {
        removeRatingCardHost(host);
      }

      return;
    }

    if (cardState.cardView === "auth") {
      renderAuthCard();
      return;
    }

    if (cardState.resolveResponse.status !== "found") {
      renderNotFoundCard();
      return;
    }

    const display = buildCardDisplayContext(
      cardState.resolveResponse,
      t,
      escapeHtmlText
    );
    const cardTitle = resolveCardDisplayTitle(cardState.resolveResponse, readCardPageTitle());

    cardElement.innerHTML = `
      <div class="reviewo-card-scroll">
        ${renderCardHeaderMarkup(display.eyebrowLabel, cardTitle)}
        ${display.primaryStatsMarkup}
        ${display.secondaryStatsMarkup}
        ${renderRateSection()}
        ${renderCommunityReviewsSection()}
        ${renderSettingsTipSection()}
      </div>
      <div class="reviewo-card-links">
        <a class="reviewo-details" href="${escapeHtmlAttribute(buildEntityPageUrl(display.detailsEntityPagePath))}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(t("card.moreDetails"))}</a>
      </div>
      ${renderCardChatSectionMarkup(t, cardState.resolveResponse.entity.id)}
    `;

    bindCardActions();
  }

  function renderAuthCard(): void {
    const cardTitle = resolveCardDisplayTitle(cardState.resolveResponse, readCardPageTitle());

    cardElement.innerHTML = `
      ${renderAuthCardHeaderMarkup(cardTitle)}
      ${renderCardAuthPanelMarkup(t, {
        authMode: cardState.authMode,
        pendingScore: cardState.pendingRatingScore
      })}
    `;

    bindAuthCardActions();
  }

  function renderAuthCardHeaderMarkup(cardTitle: string): string {
    return `
      <header class="reviewo-card-header">
        <div class="reviewo-card-heading">
          <button type="button" class="reviewo-auth-back" data-auth-back aria-label="${escapeHtmlAttribute(t("card.auth.backAriaLabel"))}">&larr;</button>
          <span class="reviewo-eyebrow">${escapeHtmlText(t("card.auth.headerEyebrow"))}</span>
          <h2 class="reviewo-title" title="${escapeHtmlAttribute(cardTitle)}">${escapeHtmlText(cardTitle)}</h2>
        </div>
        <div class="reviewo-header-aside">
          <div class="reviewo-header-controls">
            ${renderCardPinButtonMarkup(t, cardState.isPinned)}
            <button type="button" class="reviewo-dismiss" aria-label="${escapeHtmlAttribute(t("card.dismissAriaLabel"))}">&times;</button>
          </div>
        </div>
      </header>
    `;
  }

  function bindAuthCardActions(): void {
    const pageSessionKey = readRatingCardSessionKey(cardState.resolveResponse.url.input);
    const cardHost = host as RatingCardHost;

    const dismissCard = (): void => {
      cardState.pendingRatingScore = null;
      cardState.cardView = "main";
      cardState.isPinned = false;
      setRatingCardPinned(cardHost, false);
      requestDismissRatingCard(pageSessionKey);
      hideRatingCard();
    };

    cardElement.querySelector(".reviewo-dismiss")?.addEventListener("click", dismissCard);

    bindCardPinButton(
      cardElement,
      cardHost,
      () => cardState.isPinned,
      (pinned) => {
        cardState.isPinned = pinned;
      },
      t
    );
    syncCardPinDismissBehavior(cardHost);

    bindCardAuthPanel(cardElement, t, {
      authMode: cardState.authMode,
      onAuthModeChange: (nextMode) => {
        cardState.authMode = nextMode;
        renderAuthCard();
      },
      onCancel: () => {
        cancelPendingAuth();
      },
      onSuccess: () => handleAuthSuccess()
    });
  }

  function cancelPendingAuth(): void {
    cardState.pendingRatingScore = null;
    cardState.cardView = "main";
    renderCard();
  }

  async function handleAuthSuccess(): Promise<void> {
    const pendingScore = cardState.pendingRatingScore;
    cardState.cardView = "main";
    cardState.pendingRatingScore = null;
    await refreshAuthState();

    if (pendingScore !== null && cardState.isAuthenticated && cardState.myRatingScore === null) {
      await handleRatingSubmit(pendingScore);
      return;
    }

    renderCard();
  }

  function openAuthForRating(score: number): void {
    cardState.authMode = "register";
    cardState.pendingRatingScore = score;
    cardState.cardView = "auth";
    renderAuthCard();
  }

  function openAuthForChat(): void {
    cardState.authMode = "register";
    cardState.pendingRatingScore = null;
    cardState.cardView = "auth";
    renderAuthCard();
  }

  function renderRateSection(): string {
    if (cardState.myRatingScore !== null) {
      return "";
    }

    return `
      <div class="reviewo-rate-section">
        <p class="reviewo-rate-label">${escapeHtmlText(t("card.rate.label"))}</p>
        <div class="reviewo-rate-controls" role="group" aria-label="${escapeHtmlAttribute(t("card.rate.groupAriaLabel"))}">
          ${RATING_SCORES.map((score) => {
            const isSelected = cardState.pendingRatingScore === score;
            const isDisabled = cardState.isSubmitting;

            return `
              <button
                type="button"
                class="reviewo-rate-button${isSelected ? " is-selected" : ""}"
                data-score="${score}"
                aria-pressed="${isSelected}"
                ${isDisabled ? "disabled" : ""}
              >
                ${score}
              </button>
            `;
          }).join("")}
        </div>
        <p class="reviewo-rate-status" hidden></p>
      </div>
    `;
  }

  function renderCardHeaderMarkup(eyebrowLabel: string, cardTitle: string): string {
    return `
      <header class="reviewo-card-header">
        <div class="reviewo-card-heading">
          <span class="reviewo-eyebrow">${escapeHtmlText(eyebrowLabel)}</span>
          <h2 class="reviewo-title" title="${escapeHtmlAttribute(cardTitle)}">${escapeHtmlText(cardTitle)}</h2>
        </div>
        <div class="reviewo-header-aside">
          ${renderSiteSnoozePanelMarkup(t, {
            showDisableEverywhere: cardState.onSiteRatingCardEnabled
          })}
          <div class="reviewo-header-controls">
            ${renderCardPinButtonMarkup(t, cardState.isPinned)}
            <button type="button" class="reviewo-dismiss" aria-label="${escapeHtmlAttribute(t("card.dismissAriaLabel"))}">&times;</button>
          </div>
        </div>
      </header>
    `;
  }

  function renderCommunityReviewsSection(): string {
    return renderCardCommunityReviewsMarkup(
      t,
      getCommunityReviewsState(),
      cardState.reviewsError,
      cardState.activeReviewIndex
    );
  }

  function renderSettingsTipSection(): string {
    if (!cardState.showSettingsTip) {
      return "";
    }

    return renderCardSettingsTipMarkup(
      cardState.settingsTipHotkeyLabel,
      cardState.settingsTipHotkeyEnabled,
      t
    );
  }

  function renderNotFoundCard(): void {
    const cardTitle = resolveCardDisplayTitle(cardState.resolveResponse, readCardPageTitle());

    cardElement.innerHTML = `
      ${renderCardHeaderMarkup(t("card.eyebrow.currentPage"), cardTitle)}
      ${renderNotFoundStats(t)}
      ${renderNotFoundRateSection()}
      ${renderSettingsTipSection()}
    `;

    bindCardActions();
  }

  function renderNotFoundRateSection(): string {
    if (cardState.myRatingScore !== null) {
      return "";
    }

    return `
      <div class="reviewo-rate-section">
        <p class="reviewo-rate-label">${escapeHtmlText(t("card.rate.label"))}</p>
        <p class="reviewo-first-rating-copy">${escapeHtmlText(t("card.notFound.rateHint"))}</p>
        <div class="reviewo-rate-controls" role="group" aria-label="${escapeHtmlAttribute(t("card.rate.groupAriaLabel"))}">
          ${RATING_SCORES.map((score) => {
            const isSelected = cardState.pendingRatingScore === score;
            const isDisabled = cardState.isSubmitting;

            return `
              <button
                type="button"
                class="reviewo-rate-button${isSelected ? " is-selected" : ""}"
                data-score="${score}"
                aria-pressed="${isSelected}"
                ${isDisabled ? "disabled" : ""}
              >
                ${score}
              </button>
            `;
          }).join("")}
        </div>
        <p class="reviewo-rate-status" hidden></p>
      </div>
    `;
  }

  function bindCardActions(): void {
    const pageSessionKey = readRatingCardSessionKey(cardState.resolveResponse.url.input);
    const cardHost = host as RatingCardHost;

    const dismissCard = (): void => {
      cardState.isPinned = false;
      setRatingCardPinned(cardHost, false);
      requestDismissRatingCard(pageSessionKey);
      hideRatingCard();
    };

    cardElement.querySelector(".reviewo-dismiss")?.addEventListener("click", dismissCard);

    bindSiteSnoozePanel(cardElement, cardState.resolveResponse.url.input, {
      onSnoozed: () => {
        requestDismissRatingCard(pageSessionKey);
        hideRatingCard();
      },
      onDisableEverywhere: async () => {
        cardState.onSiteRatingCardEnabled = false;
        cardElement.querySelector(".reviewo-disable-everywhere-button")?.remove();

        const preferences = await readExtensionPreferences();
        const hotkeyLabel = formatRatingCardHotkeyLabel(preferences.ratingCardHotkey, t);

        showDisableEverywhereFeedback({
          hotkeyEnabled: preferences.ratingCardHotkeyEnabled,
          hotkeyLabel,
          t
        });

        await saveExtensionPreferences({
          ...preferences,
          onSiteRatingCardEnabled: false
        });
      }
    });

    bindCardPinButton(
      cardElement,
      cardHost,
      () => cardState.isPinned,
      (pinned) => {
        cardState.isPinned = pinned;
      },
      t
    );
    syncCardPinDismissBehavior(cardHost);

    bindCardSettingsTip(cardElement);

    cardElement.querySelectorAll<HTMLButtonElement>(".reviewo-rate-button").forEach((button) => {
      button.addEventListener("click", () => {
        const score = Number(button.dataset.score);

        if (!Number.isInteger(score)) {
          return;
        }

        if (!cardState.isAuthenticated) {
          openAuthForRating(score);
          return;
        }

        updateRatingButtonSelection(score);
        void handleRatingSubmit(score);
      });
    });

    if (cardState.resolveResponse.status === "found") {
      bindCardCommunityReviews(
        cardElement,
        t,
        getCommunityReviewsState,
        (nextState) => {
          const didUpdateMyReview = nextState.myReviewText !== (cardState.myReviewText ?? "");

          cardState.myReviewText = nextState.myReviewText;
          cardState.myReviewUpdatedAt = didUpdateMyReview && nextState.hasCurrentUserReview
            ? new Date().toISOString()
            : cardState.myReviewUpdatedAt;
          cardState.reviews = nextState.reviews;
          cardState.reviewsSort = nextState.sort;
          cardState.showAllReviews = nextState.showAllReviews;
        },
        {
          onToggleShowAll: async () => {
            cardState.showAllReviews = !cardState.showAllReviews;
            await reloadCommunityReviews();
          }
        },
        {
          getActiveIndex: () => cardState.activeReviewIndex,
          setActiveIndex: (index) => {
            cardState.activeReviewIndex = index;
          }
        }
      );

      bindCardChatDrawer(
        cardElement,
        t,
        cardState.resolveResponse.entity.id,
        {
          accessToken: cardState.accessToken,
          entityId: cardState.resolveResponse.entity.id,
          entityTitle: cardState.resolveResponse.entity.title,
          initialChatLocale: resolveExtensionContentLocale(cardState.localePreference),
          isAuthenticated: cardState.isAuthenticated
        },
        {
          onRequestSignIn: openAuthForChat
        }
      );
    }
  }

  function updateRatingButtonSelection(selectedScore: number | null): void {
    cardElement.querySelectorAll<HTMLButtonElement>(".reviewo-rate-button").forEach((button) => {
      const score = Number(button.dataset.score);
      const isSelected = selectedScore === score;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
      button.disabled = cardState.isSubmitting;
    });
  }

  function updateRatingControlsState(): void {
    updateRatingButtonSelection(cardState.myRatingScore);
  }

  function setRateStatus(message: string, tone: "default" | "error" | "success" = "default"): void {
    const statusElement = cardElement.querySelector<HTMLParagraphElement>(".reviewo-rate-status");

    if (!statusElement) {
      return;
    }

    statusElement.hidden = !message;
    statusElement.textContent = message;
    statusElement.classList.remove("is-error", "is-success");

    if (tone === "error") {
      statusElement.classList.add("is-error");
    }

    if (tone === "success") {
      statusElement.classList.add("is-success");
    }
  }

  async function handleRatingSubmit(score: number): Promise<void> {
    if (!cardState.isAuthenticated || cardState.isSubmitting) {
      return;
    }

    cardState.isSubmitting = true;
    cardState.myRatingScore = score;
    setRateStatus(t("rating.saving"));
    updateRatingControlsState();

    if (cardState.resolveResponse.status === "found") {
      const submitResult = await submitEntityRating(
        getRateTargetEntityId(cardState.resolveResponse),
        score
      );
      cardState.isSubmitting = false;

      if (submitResult.result) {
        cardState.resolveResponse = mergeQuickRatingIntoFoundResponse(
          cardState.resolveResponse,
          submitResult.result
        );
        cardState.myRatingScore = submitResult.result.myRating.score;
        await publishEntityRatingUpdate({
          canonicalUrl: cardState.resolveResponse.url.canonical,
          entityId: submitResult.result.entity.id,
          quickRating: submitResult.result,
          score: submitResult.result.myRating.score
        });
        requestMarkEntityRatedOnTab(readRatingCardSessionKey(cardState.resolveResponse.url.input));
        setRateStatus(t("rating.saved"), "success");
        renderCard();
        return;
      }

      if (submitResult.errorMessage?.toLowerCase().includes("authentication")) {
        cardState.isAuthenticated = false;
        setRateStatus(t("card.rate.signInRequired"), "error");
        renderCard();
        return;
      }

      setRateStatus(submitResult.errorMessage ?? t("rating.saveError"), "error");
      renderCard();
      return;
    }

    const submitResult = await submitEntityRatingByUrl(
      cardState.resolveResponse.url.input,
      score,
      readCardPageTitle()
    );
    cardState.isSubmitting = false;

    if (submitResult.result) {
      cardState.resolveResponse = toFoundResponseFromByUrlRating(submitResult.result);
      cardState.myRatingScore = submitResult.result.myRating.score;
      const reviewsResult = await fetchEntityReviews(
        submitResult.result.entity.id,
        cardState.isAuthenticated
      );

      if (reviewsResult.errorMessage) {
        cardState.reviewsError = reviewsResult.errorMessage;
        cardState.reviews = [];
      } else {
        cardState.reviewsError = null;
        cardState.reviews = reviewsResult.reviews ?? [];
      }

      await publishEntityRatingUpdate({
        canonicalUrl: submitResult.result.url.canonical,
        entityId: submitResult.result.entity.id,
        quickRating: submitResult.result,
        score: submitResult.result.myRating.score
      });
      requestMarkEntityRatedOnTab(readRatingCardSessionKey(cardState.resolveResponse.url.input));
      const successMessage =
        submitResult.result.entityProvision.mode === "created"
          ? t("rating.firstPageCreated")
          : t("rating.saved");
      setRateStatus(successMessage, "success");
      renderCard();
      return;
    }

    if (submitResult.errorMessage?.toLowerCase().includes("authentication")) {
      cardState.isAuthenticated = false;
      setRateStatus(t("card.rate.signInRequired"), "error");
      renderCard();
      return;
    }

    setRateStatus(submitResult.errorMessage ?? "Could not save rating.", "error");
    renderCard();
  }

  const storageListener: StorageListener = (changes, areaName) => {
    try {
      if (!guardExtensionContext()) {
        return;
      }

      if (areaName !== "local") {
        return;
      }

      if ("reviewo.extensionAuth" in changes || ENTITY_RATINGS_STORAGE_KEY in changes) {
        void refreshAuthState();
      }
    } catch {
      markExtensionContextInvalidated();
    }
  };

  (host as RatingCardHost).reviewoStorageListener = storageListener;
  addStorageChangedListener(storageListener);

  (host as RatingCardHost).reviewoResponsiveScaleCleanup = installCardResponsiveScale(host);

  activeRatingCardLocaleRefresh = () => {
    void readExtensionPreferences().then((latestPreferences) => {
      t = createExtensionTranslatorFromPreference(latestPreferences.locale);
      cardState.settingsTipHotkeyEnabled = latestPreferences.ratingCardHotkeyEnabled;
      cardState.settingsTipHotkeyLabel = formatRatingCardHotkeyLabel(
        latestPreferences.ratingCardHotkey,
        t
      );
      cardState.onSiteRatingCardEnabled = latestPreferences.onSiteRatingCardEnabled;
      const localeChanged = cardState.localePreference !== latestPreferences.locale;
      cardState.localePreference = latestPreferences.locale;

      if (localeChanged) {
        cardState.showAllReviews = false;
        void reloadCommunityReviews();
      }

      if (!document.contains(host)) {
        return;
      }

      cardElement.setAttribute("aria-label", t("card.ariaLabel"));

      if (isCardContentReady) {
        renderCard();
      }
    });
  };

  void revealCardWhenReady();

  async function revealCardWhenReady(): Promise<void> {
    await refreshAuthState();

    if (
      !isCardStillRelevant() ||
      !isPageContentReadyForCard(cardState.resolveResponse.url.input)
    ) {
      if (document.contains(host)) {
        removeRatingCardHost(host);
      }

      return;
    }

    const [latestPreferences, tipDismissed] = await Promise.all([
      readExtensionPreferences(),
      isOnSiteCardTipDismissed()
    ]);
    cardState.settingsTipHotkeyEnabled = latestPreferences.ratingCardHotkeyEnabled;
    cardState.settingsTipHotkeyLabel = formatRatingCardHotkeyLabel(latestPreferences.ratingCardHotkey, t);
    cardState.showSettingsTip = !tipDismissed;

    isCardContentReady = true;
    renderCard();

    shellElement.classList.remove("is-preparing");
    shellElement.classList.add("is-entering");

    (host as RatingCardHost).reviewoTitleRefreshCleanup = installCardTitleRefresh(() => {
      if (!isCardStillRelevant()) {
        return;
      }

      renderCard();
    }, cardState.resolveResponse.url.input);

    if (latestPreferences.autoDismissSeconds > 0) {
      bindAutoDismiss(host, shellElement, latestPreferences.autoDismissSeconds);
    }

    bindOutsideDismiss(host);
  }
}

export async function showRatingCardOnDemand(
  response: ExtensionResolveResponse
): Promise<void> {
  if (!isResolveResultForCurrentPage(response)) {
    return;
  }

  const preferences = await readExtensionPreferences();
  await showRatingCard(response, preferences);
}

export async function showRatingCardForResolveResult(
  response: ExtensionResolveResponse
): Promise<void> {
  if (!isResolveResultForCurrentPage(response)) {
    return;
  }

  const preferences = await readExtensionPreferences();

  if (!preferences.onSiteRatingCardEnabled) {
    return;
  }

  await showRatingCard(response, preferences);
}

/** @deprecated Use showRatingCardForResolveResult */
export async function showRatingCardForFoundEntity(
  response: ExtensionResolveFoundResponse
): Promise<void> {
  await showRatingCardForResolveResult(response);
}

function renderNotFoundStats(t: TranslateFn): string {
  return `
    <div class="reviewo-stats reviewo-stats-empty">
      <p class="reviewo-no-ratings">${escapeHtmlText(t("rating.stats.noRatings"))}</p>
      <p class="reviewo-meta">${escapeHtmlText(t("rating.stats.beFirst"))}</p>
    </div>
  `;
}

function buildEntityPageUrl(entityPagePath: string): string {
  return new URL(entityPagePath, extensionConfig.webBaseUrl).toString();
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}
