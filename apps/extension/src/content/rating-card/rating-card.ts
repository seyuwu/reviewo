import {
  addStorageChangedListener,
  guardExtensionContext,
  markExtensionContextInvalidated,
  removeStorageChangedListener
} from "../extension-context.js";
import { readExtensionPreferences } from "../../shared/extension-preferences-storage.js";
import type { ExtensionUserPreferences } from "../../shared/preferences.js";
import { extensionConfig } from "../../shared/config.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import type { ExtensionResolveResponse } from "../../shared/types/resolve.js";
import { hasAuthenticatedExtensionSession, getExtensionSessionUserId } from "./auth-session-state.js";
import { ENTITY_RATINGS_STORAGE_KEY, readPersistedEntityRatingByCanonical, readPersistedEntityRatingEntry } from "../../shared/entity-rating-sync.js";
import { mergeQuickRatingIntoFoundResponse } from "../../shared/merge-rating-response.js";
import { publishEntityRatingUpdate } from "../../shared/publish-entity-rating-update.js";
import { applyCardPlacement } from "./card-placement.js";
import { bindAutoDismiss, clearAutoDismiss } from "./auto-dismiss.js";
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
import { requestDismissRatingCard, requestMarkEntityRatedOnTab, readRatingCardSessionKey, isResolveResultForCurrentPage } from "./rating-card-session.js";

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

export function removeAllRatingCardHosts(): void {
  for (const host of findAllRatingCardHosts()) {
    removeRatingCardHost(host);
  }
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
    clearAutoDismissPending(host);
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
  if (host.reviewoStorageListener) {
    removeStorageChangedListener(host.reviewoStorageListener);
  }

  if (host.reviewoTitleRefreshCleanup) {
    host.reviewoTitleRefreshCleanup();
  }

  if (host.reviewoResponsiveScaleCleanup) {
    host.reviewoResponsiveScaleCleanup();
  }

  clearAutoDismissPending(host);
  clearAutoDismiss(host);
  host.remove();
}

function clearAutoDismissPending(host: RatingCardHost): void {
  if (host.reviewoAutoDismissPendingCleanup) {
    host.reviewoAutoDismissPendingCleanup();
    host.reviewoAutoDismissPendingCleanup = undefined;
  }
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

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleElement = document.createElement("style");
  styleElement.textContent = RATING_CARD_STYLES;

  const shellElement = document.createElement("div");
  shellElement.className = "reviewo-card-shell is-preparing";

  const cardElement = document.createElement("article");
  cardElement.className = "reviewo-card";
  cardElement.setAttribute("role", "complementary");
  cardElement.setAttribute("aria-label", "Reviewo rating summary");

  shellElement.append(cardElement);
  shadowRoot.append(styleElement, shellElement);
  document.documentElement.append(host);

  const cardState: {
    cachedPageTitle?: string;
    currentUserId?: string;
    isAuthenticated: boolean;
    isSubmitting: boolean;
    myRatingScore: number | null;
    myReviewText: string | null;
    myReviewUpdatedAt: string | null;
    resolveResponse: ExtensionResolveResponse;
    reviewDisplayMode: ExtensionUserPreferences["popupReviewDisplayMode"];
    reviews: CardEntityReview[];
    reviewsError: string | null;
    reviewsLimit: number;
    reviewsSort: CardReviewSort;
  } = {
    isAuthenticated: false,
    isSubmitting: false,
    myRatingScore: null,
    myReviewText: null,
    myReviewUpdatedAt: null,
    resolveResponse,
    reviewDisplayMode: preferences.popupReviewDisplayMode,
    reviews: [],
    reviewsError: null,
    reviewsLimit: preferences.popupReviewsLimit,
    reviewsSort: "likes"
  };

  let isCardContentReady = false;

  function isCardStillRelevant(): boolean {
    return (
      document.contains(host) &&
      isResolveResultForCurrentPage(cardState.resolveResponse)
    );
  }

  async function refreshAuthState(): Promise<void> {
    cardState.isAuthenticated = await hasAuthenticatedExtensionSession();
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
          fetchMyEntityReview(entityId),
          fetchEntityReviews(entityId, true)
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
        const reviewsResult = await fetchEntityReviews(entityId, false);

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
    return {
      currentUserId: cardState.currentUserId,
      displayMode: cardState.reviewDisplayMode,
      isAuthenticated: cardState.isAuthenticated,
      reviews: cardState.reviews,
      reviewsLimit: cardState.reviewsLimit,
      sort: cardState.reviewsSort
    };
  }

  function readCardPageTitle(): string | undefined {
    const pageTitle = readPageSourceTitle(cardState.resolveResponse.url.input);

    if (pageTitle) {
      cardState.cachedPageTitle = pageTitle;
    }

    return pageTitle ?? cardState.cachedPageTitle;
  }

  function renderCard(): void {
    if (!isCardContentReady || !isCardStillRelevant()) {
      if (!isCardStillRelevant()) {
        removeRatingCardHost(host);
      }

      return;
    }
    if (cardState.resolveResponse.status !== "found") {
      renderNotFoundCard();
      return;
    }

    const display = buildCardDisplayContext(
      cardState.resolveResponse,
      escapeHtmlText
    );
    const cardTitle = resolveCardDisplayTitle(cardState.resolveResponse, readCardPageTitle());

    cardElement.innerHTML = `
      ${renderCardHeaderMarkup(display.eyebrowLabel, cardTitle)}
      ${display.primaryStatsMarkup}
      ${display.secondaryStatsMarkup}
      ${renderRateSection()}
      ${renderCommunityReviewsSection()}
      <a class="reviewo-details" href="${escapeHtmlAttribute(buildEntityPageUrl(display.detailsEntityPagePath))}" target="_blank" rel="noopener noreferrer">More details</a>
    `;

    bindCardActions();
  }

  function renderRateSection(): string {
    if (cardState.myRatingScore !== null) {
      return "";
    }

    return `
      <div class="reviewo-rate-section">
        <p class="reviewo-rate-label">Your rating</p>
        <div class="reviewo-rate-controls" role="group" aria-label="Rate this site">
          ${RATING_SCORES.map((score) => {
            const isSelected = cardState.myRatingScore === score;
            const isDisabled = !cardState.isAuthenticated || cardState.isSubmitting;

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
        <p class="reviewo-rate-hint${cardState.isAuthenticated ? " is-hidden" : ""}">
          Sign in through Reviewo to rate.
        </p>
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
          ${renderSiteSnoozePanelMarkup()}
          <button type="button" class="reviewo-dismiss" aria-label="Dismiss Reviewo card">&times;</button>
        </div>
      </header>
    `;
  }

  function renderCommunityReviewsSection(): string {
    return renderCardCommunityReviewsMarkup(getCommunityReviewsState(), cardState.reviewsError);
  }

  function renderNotFoundCard(): void {
    const cardTitle = resolveCardDisplayTitle(cardState.resolveResponse, readCardPageTitle());

    cardElement.innerHTML = `
      ${renderCardHeaderMarkup("Current page", cardTitle)}
      ${renderNotFoundStats()}
      ${renderNotFoundRateSection()}
    `;

    bindCardActions();
  }

  function renderNotFoundRateSection(): string {
    if (cardState.myRatingScore !== null) {
      return "";
    }

    return `
      <div class="reviewo-rate-section">
        <p class="reviewo-rate-label">Your rating</p>
        <p class="reviewo-first-rating-copy">Rate this page to add it to Reviewo.</p>
        <div class="reviewo-rate-controls" role="group" aria-label="Rate this site">
          ${RATING_SCORES.map((score) => {
            const isSelected = cardState.myRatingScore === score;
            const isDisabled = !cardState.isAuthenticated || cardState.isSubmitting;

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
        <p class="reviewo-rate-hint${cardState.isAuthenticated ? " is-hidden" : ""}">
          Sign in through Reviewo to rate.
        </p>
        <p class="reviewo-rate-status" hidden></p>
      </div>
    `;
  }

  function bindCardActions(): void {
    const pageSessionKey = readRatingCardSessionKey(cardState.resolveResponse.url.input);

    cardElement.querySelector(".reviewo-dismiss")?.addEventListener("click", () => {
      requestDismissRatingCard(pageSessionKey);
      hideRatingCard();
    });

    bindSiteSnoozePanel(cardElement, cardState.resolveResponse.url.input, () => {
      requestDismissRatingCard(pageSessionKey);
      hideRatingCard();
    });

    cardElement.querySelectorAll<HTMLButtonElement>(".reviewo-rate-button").forEach((button) => {
      button.addEventListener("click", () => {
        const score = Number(button.dataset.score);

        if (!Number.isInteger(score)) {
          return;
        }

        updateRatingButtonSelection(score);
        void handleRatingSubmit(score);
      });
    });

    if (cardState.resolveResponse.status === "found") {
      bindCardCommunityReviews(
        cardElement,
        getCommunityReviewsState,
        (nextState) => {
          cardState.reviews = nextState.reviews;
          cardState.reviewsSort = nextState.sort;
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
      button.disabled = !cardState.isAuthenticated || cardState.isSubmitting;
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
    setRateStatus("Saving rating...");
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
        setRateStatus("Rating saved.", "success");
        renderCard();
        return;
      }

      if (submitResult.errorMessage?.toLowerCase().includes("authentication")) {
        cardState.isAuthenticated = false;
        setRateStatus("Sign in through Reviewo to rate.", "error");
        renderCard();
        return;
      }

      setRateStatus(submitResult.errorMessage ?? "Could not save rating.", "error");
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
          ? "You created the first Reviewo page for this site."
          : "Rating saved.";
      setRateStatus(successMessage, "success");
      renderCard();
      return;
    }

    if (submitResult.errorMessage?.toLowerCase().includes("authentication")) {
      cardState.isAuthenticated = false;
      setRateStatus("Sign in through Reviewo to rate.", "error");
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

    if (preferences.autoDismissSeconds > 0) {
      bindAutoDismiss(host, preferences.autoDismissSeconds);
    }
  }
}

export async function showRatingCardForResolveResult(
  response: ExtensionResolveResponse
): Promise<void> {
  if (!isResolveResultForCurrentPage(response)) {
    return;
  }

  const preferences = await readExtensionPreferences();
  await showRatingCard(response, preferences);
}

/** @deprecated Use showRatingCardForResolveResult */
export async function showRatingCardForFoundEntity(
  response: ExtensionResolveFoundResponse
): Promise<void> {
  await showRatingCardForResolveResult(response);
}

function renderNotFoundStats(): string {
  return `
    <div class="reviewo-stats reviewo-stats-empty">
      <p class="reviewo-no-ratings">No ratings yet</p>
      <p class="reviewo-meta">Be the first to rate</p>
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
