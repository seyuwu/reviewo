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
import { hasAuthenticatedExtensionSession } from "./auth-session-state.js";
import { bindAutoDismiss, clearAutoDismiss } from "./auto-dismiss.js";
import { buildCardDisplayContext, getRateTargetEntityId } from "./card-display.js";
import { toFoundResponseFromByUrlRating } from "./convert-by-url-rating.js";
import { mergeQuickRatingIntoFoundResponse } from "./merge-rating-response.js";
import { readPageSourceTitle } from "./read-page-title.js";
import { RATING_CARD_STYLES } from "./rating-card-styles.js";
import { submitEntityRating } from "./submit-entity-rating.js";
import { submitEntityRatingByUrl } from "./submit-entity-rating-by-url.js";
import { requestDismissRatingCard } from "./rating-card-session.js";
import { deriveTitleFromCanonicalUrl } from "./title-from-url.js";

const RATING_CARD_HOST_ID = "reviewo-rating-card-host";
const RATING_CARD_ROOT_CLASS = "reviewo-rating-card-root";
const RATING_SCORES = [1, 2, 3, 4, 5] as const;

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

type RatingCardHost = HTMLElement & {
  reviewoStorageListener?: StorageListener;
};

export function hideRatingCard(): void {
  const host = document.getElementById(RATING_CARD_HOST_ID) as RatingCardHost | null;

  if (host?.reviewoStorageListener) {
    removeStorageChangedListener(host.reviewoStorageListener);
  }

  if (host) {
    clearAutoDismiss(host);
  }

  host?.remove();
}

export function showRatingCard(
  resolveResponse: ExtensionResolveResponse,
  preferences: ExtensionUserPreferences
): void {
  hideRatingCard();

  const host = document.createElement("div");
  host.id = RATING_CARD_HOST_ID;
  host.className = RATING_CARD_ROOT_CLASS;

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleElement = document.createElement("style");
  styleElement.textContent = RATING_CARD_STYLES;

  const cardElement = document.createElement("article");
  cardElement.className = "reviewo-card";
  cardElement.setAttribute("role", "complementary");
  cardElement.setAttribute("aria-label", "Reviewo rating summary");

  shadowRoot.append(styleElement, cardElement);
  document.documentElement.append(host);

  const cardState: {
    displayTarget: ExtensionUserPreferences["cardDisplayTarget"];
    isAuthenticated: boolean;
    isSubmitting: boolean;
    myRatingScore: number | null;
    resolveResponse: ExtensionResolveResponse;
  } = {
    displayTarget: preferences.cardDisplayTarget,
    isAuthenticated: false,
    isSubmitting: false,
    myRatingScore: null,
    resolveResponse
  };

  async function refreshAuthState(): Promise<void> {
    cardState.isAuthenticated = await hasAuthenticatedExtensionSession();
    renderCard();
  }

  function renderCard(): void {
    if (cardState.resolveResponse.status !== "found") {
      renderNotFoundCard();
      return;
    }

    const display = buildCardDisplayContext(
      cardState.resolveResponse,
      cardState.displayTarget,
      escapeHtmlText
    );

    cardElement.innerHTML = `
      <header class="reviewo-card-header">
        <span class="reviewo-eyebrow">${escapeHtmlText(display.eyebrowLabel)}</span>
        <button type="button" class="reviewo-dismiss" aria-label="Dismiss Reviewo card">&times;</button>
      </header>
      <h2 class="reviewo-title" title="${escapeHtmlAttribute(display.title)}">${escapeHtmlText(display.title)}</h2>
      ${display.primaryStatsMarkup}
      ${display.secondaryStatsMarkup}
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
          Sign in through the extension popup to rate.
        </p>
        <p class="reviewo-rate-status" hidden></p>
      </div>
      <a class="reviewo-details" href="${escapeHtmlAttribute(buildEntityPageUrl(display.detailsEntityPagePath))}" target="_blank" rel="noopener noreferrer">More details</a>
    `;

    bindCardActions();
  }

  function renderNotFoundCard(): void {
    const cardTitle = getCardTitle(cardState.resolveResponse);

    cardElement.innerHTML = `
      <header class="reviewo-card-header">
        <span class="reviewo-eyebrow">Reviewo</span>
        <button type="button" class="reviewo-dismiss" aria-label="Dismiss Reviewo card">&times;</button>
      </header>
      <h2 class="reviewo-title" title="${escapeHtmlAttribute(cardTitle)}">${escapeHtmlText(cardTitle)}</h2>
      ${renderNotFoundStats()}
      <div class="reviewo-rate-section">
        <p class="reviewo-rate-label">Be the first to rate this site</p>
        <p class="reviewo-first-rating-copy">No Reviewo page exists yet. Your rating will create it.</p>
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
          Sign in through the extension popup to rate.
        </p>
        <p class="reviewo-rate-status" hidden></p>
      </div>
    `;

    bindCardActions();
  }

  function bindCardActions(): void {
    cardElement.querySelector(".reviewo-dismiss")?.addEventListener("click", () => {
      requestDismissRatingCard(cardState.resolveResponse.url.canonical);
      hideRatingCard();
    });

    cardElement.querySelectorAll<HTMLButtonElement>(".reviewo-rate-button").forEach((button) => {
      button.addEventListener("click", () => {
        const score = Number(button.dataset.score);

        if (!Number.isInteger(score)) {
          return;
        }

        void handleRatingSubmit(score);
      });
    });
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
    setRateStatus("Saving rating...");
    renderCard();

    if (cardState.resolveResponse.status === "found") {
      const submitResult = await submitEntityRating(
        getRateTargetEntityId(cardState.resolveResponse, cardState.displayTarget),
        score
      );
      cardState.isSubmitting = false;

      if (submitResult.result) {
        cardState.resolveResponse = mergeQuickRatingIntoFoundResponse(
          cardState.resolveResponse,
          submitResult.result
        );
        cardState.myRatingScore = submitResult.result.myRating.score;
        setRateStatus("Rating saved.", "success");
        renderCard();
        return;
      }

      if (submitResult.errorMessage?.toLowerCase().includes("authentication")) {
        cardState.isAuthenticated = false;
        setRateStatus("Sign in through the extension popup to rate.", "error");
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
      readPageSourceTitle()
    );
    cardState.isSubmitting = false;

    if (submitResult.result) {
      cardState.resolveResponse = toFoundResponseFromByUrlRating(submitResult.result);
      cardState.myRatingScore = submitResult.result.myRating.score;
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
      setRateStatus("Sign in through the extension popup to rate.", "error");
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

      if (areaName !== "local" || !("reviewo.extensionAuth" in changes)) {
        return;
      }

      void refreshAuthState();
    } catch {
      markExtensionContextInvalidated();
    }
  };

  (host as RatingCardHost).reviewoStorageListener = storageListener;
  addStorageChangedListener(storageListener);

  if (shouldAutoDismissCard(resolveResponse, preferences.autoDismissSeconds)) {
    bindAutoDismiss(host, preferences.autoDismissSeconds);
  }

  void refreshAuthState();
}

export async function showRatingCardForResolveResult(
  response: ExtensionResolveResponse
): Promise<void> {
  const preferences = await readExtensionPreferences();
  showRatingCard(response, preferences);
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
      <p class="reviewo-meta">Be the first to rate this site</p>
    </div>
  `;
}

function getCardTitle(response: ExtensionResolveResponse): string {
  if (response.status === "found") {
    return response.entity.title;
  }

  return readPageSourceTitle() ?? deriveTitleFromCanonicalUrl(response.url.canonical);
}

function shouldAutoDismissCard(
  resolveResponse: ExtensionResolveResponse,
  autoDismissSeconds: number
): boolean {
  if (autoDismissSeconds <= 0) {
    return false;
  }

  if (resolveResponse.status === "not_found") {
    return false;
  }

  return resolveResponse.rating.votesCount > 0;
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
