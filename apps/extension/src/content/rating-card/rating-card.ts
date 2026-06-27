import { extensionConfig } from "../../shared/config.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import { hasAuthenticatedExtensionSession } from "./auth-session-state.js";
import { buildRatingCardSummary } from "./format-display.js";
import { mergeQuickRatingIntoFoundResponse } from "./merge-rating-response.js";
import { RATING_CARD_STYLES } from "./rating-card-styles.js";
import { submitEntityRating } from "./submit-entity-rating.js";

const RATING_CARD_HOST_ID = "reviewo-rating-card-host";
const RATING_CARD_ROOT_CLASS = "reviewo-rating-card-root";
const RATING_SCORES = [1, 2, 3, 4, 5] as const;

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

export function hideRatingCard(): void {
  const host = document.getElementById(RATING_CARD_HOST_ID) as
    | (HTMLElement & { reviewoStorageListener?: StorageListener })
    | null;

  if (host?.reviewoStorageListener) {
    chrome.storage.onChanged.removeListener(host.reviewoStorageListener);
  }

  host?.remove();
}

export function showRatingCardForFoundEntity(response: ExtensionResolveFoundResponse): void {
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

  applyHostPosition(host);
  shadowRoot.append(styleElement, cardElement);
  document.documentElement.append(host);

  const cardState: {
    foundResponse: ExtensionResolveFoundResponse;
    isAuthenticated: boolean;
    isSubmitting: boolean;
    myRatingScore: number | null;
  } = {
    foundResponse: response,
    isAuthenticated: false,
    isSubmitting: false,
    myRatingScore: null
  };

  async function refreshAuthState(): Promise<void> {
    cardState.isAuthenticated = await hasAuthenticatedExtensionSession();
    renderCard();
  }

  function renderCard(): void {
    const { averageScoreLabel, entityTitle, metaLabel } = buildRatingCardSummary(
      cardState.foundResponse
    );
    const entityPageUrl = buildEntityPageUrl(cardState.foundResponse.web.entityPagePath);

    cardElement.innerHTML = `
      <header class="reviewo-card-header">
        <span class="reviewo-eyebrow">Reviewo</span>
        <button type="button" class="reviewo-dismiss" aria-label="Dismiss Reviewo card">&times;</button>
      </header>
      <h2 class="reviewo-title" title="${escapeHtmlAttribute(entityTitle)}">${escapeHtmlText(entityTitle)}</h2>
      <div class="reviewo-stats">
        <div class="reviewo-rating-row">
          <span class="reviewo-rating-value">${escapeHtmlText(averageScoreLabel)}</span>
          <span class="reviewo-rating-scale">/ 5</span>
        </div>
        <p class="reviewo-meta">${escapeHtmlText(metaLabel)}</p>
      </div>
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
      <a class="reviewo-details" href="${escapeHtmlAttribute(entityPageUrl)}" target="_blank" rel="noopener noreferrer">
        More details
      </a>
    `;

    cardElement.querySelector(".reviewo-dismiss")?.addEventListener("click", () => {
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

    const submitResult = await submitEntityRating(cardState.foundResponse.entity.id, score);

    cardState.isSubmitting = false;

    if (submitResult.result) {
      cardState.foundResponse = mergeQuickRatingIntoFoundResponse(
        cardState.foundResponse,
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
  }

  const storageListener: StorageListener = (changes, areaName) => {
    if (areaName !== "local" || !("reviewo.extensionAuth" in changes)) {
      return;
    }

    void refreshAuthState();
  };

  (host as HTMLElement & { reviewoStorageListener?: StorageListener }).reviewoStorageListener =
    storageListener;
  chrome.storage.onChanged.addListener(storageListener);

  void refreshAuthState();
}

function applyHostPosition(host: HTMLElement): void {
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.right = "1rem";
  host.style.bottom = "1rem";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "auto";
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
