import { extensionConfig } from "../../shared/config.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import type { ExtensionResolveResponse } from "../../shared/types/resolve.js";
import { hasAuthenticatedExtensionSession } from "./auth-session-state.js";
import { toFoundResponseFromByUrlRating } from "./convert-by-url-rating.js";
import { buildRatingCardSummary } from "./format-display.js";
import { mergeQuickRatingIntoFoundResponse } from "./merge-rating-response.js";
import { readPageSourceTitle } from "./read-page-title.js";
import { RATING_CARD_STYLES } from "./rating-card-styles.js";
import { submitEntityRating } from "./submit-entity-rating.js";
import { submitEntityRatingByUrl } from "./submit-entity-rating-by-url.js";
import { deriveTitleFromCanonicalUrl } from "./title-from-url.js";

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

export function showRatingCard(resolveResponse: ExtensionResolveResponse): void {
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
    isAuthenticated: boolean;
    isSubmitting: boolean;
    myRatingScore: number | null;
    resolveResponse: ExtensionResolveResponse;
  } = {
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
    const cardTitle = getCardTitle(cardState.resolveResponse);
    const statsMarkup =
      cardState.resolveResponse.status === "found"
        ? renderFoundStats(cardState.resolveResponse)
        : renderNotFoundStats();
    const detailsMarkup =
      cardState.resolveResponse.status === "found"
        ? `<a class="reviewo-details" href="${escapeHtmlAttribute(buildEntityPageUrl(cardState.resolveResponse.web.entityPagePath))}" target="_blank" rel="noopener noreferrer">More details</a>`
        : "";
    const isFound = cardState.resolveResponse.status === "found";

    cardElement.innerHTML = `
      <header class="reviewo-card-header">
        <span class="reviewo-eyebrow">Reviewo</span>
        <button type="button" class="reviewo-dismiss" aria-label="Dismiss Reviewo card">&times;</button>
      </header>
      <h2 class="reviewo-title" title="${escapeHtmlAttribute(cardTitle)}">${escapeHtmlText(cardTitle)}</h2>
      ${statsMarkup}
      <div class="reviewo-rate-section">
        <p class="reviewo-rate-label">${isFound ? "Your rating" : "Be the first to rate this site"}</p>
        ${
          isFound
            ? ""
            : `<p class="reviewo-first-rating-copy">No Reviewo page exists yet. Your rating will create it.</p>`
        }
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
      ${detailsMarkup}
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

    if (cardState.resolveResponse.status === "found") {
      const submitResult = await submitEntityRating(cardState.resolveResponse.entity.id, score);
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

export function showRatingCardForFoundEntity(response: ExtensionResolveFoundResponse): void {
  showRatingCard(response);
}

function renderFoundStats(response: ExtensionResolveFoundResponse): string {
  const { averageScoreLabel, metaLabel } = buildRatingCardSummary(response);

  return `
    <div class="reviewo-stats">
      <div class="reviewo-rating-row">
        <span class="reviewo-rating-value">${escapeHtmlText(averageScoreLabel)}</span>
        <span class="reviewo-rating-scale">/ 5</span>
      </div>
      <p class="reviewo-meta">${escapeHtmlText(metaLabel)}</p>
    </div>
  `;
}

function renderNotFoundStats(): string {
  return `
    <div class="reviewo-stats">
      <p class="reviewo-meta">This site is not in Reviewo yet.</p>
    </div>
  `;
}

function getCardTitle(response: ExtensionResolveResponse): string {
  if (response.status === "found") {
    return response.entity.title;
  }

  return readPageSourceTitle() ?? deriveTitleFromCanonicalUrl(response.url.canonical);
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
