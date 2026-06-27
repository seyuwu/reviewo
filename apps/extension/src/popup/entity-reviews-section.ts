import {
  fetchEntityReviews,
  fetchMyEntityReview,
  likeEntityReview,
  unlikeEntityReview,
  upsertMyEntityReview
} from "./services/entity-reviews-api.js";
import {
  hasSavedReviewText,
  resolveMyReviewText
} from "./review-display.js";
import { sortEntityReviews } from "./review-sort.js";
import { breakLongUnbrokenText } from "../shared/break-long-text.js";
import { isReviewByCurrentUser } from "../shared/review-ownership.js";
import {
  formatReviewLengthCounter,
  isReviewTextWithinLimit,
  MAX_REVIEW_TEXT_LENGTH,
  reviewLengthCounterClass
} from "../shared/review-limits.js";
import { formatReviewSnippet } from "../shared/review-snippet.js";
import type { PopupReviewDisplayMode } from "../shared/preferences.js";
import { escapeHtml } from "./view-helpers.js";
import type { ExtensionReview, ExtensionReviewSort } from "./types/review.js";

export interface EntityReviewsSectionState {
  currentUserId?: string;
  displayMode: PopupReviewDisplayMode;
  isAuthenticated: boolean;
  reviews: ExtensionReview[];
  reviewsLimit: number;
  sort: ExtensionReviewSort;
}

export interface EntityReviewsSectionRenderOptions {
  displayMode?: PopupReviewDisplayMode;
  hideMyReviewWhenSaved?: boolean;
  reviewsLimit?: number;
  showReviewForm?: boolean;
}

export async function loadEntityReviewsSectionState(
  entityId: string,
  isAuthenticated: boolean,
  currentUserId?: string,
  options: EntityReviewsSectionRenderOptions = {}
): Promise<{
  errorMessage?: string;
  myReviewText?: string;
  state?: EntityReviewsSectionState;
}> {
  const [reviewsResult, myReviewResult] = await Promise.all([
    fetchEntityReviews(entityId, isAuthenticated),
    isAuthenticated ? fetchMyEntityReview(entityId) : Promise.resolve({ review: null })
  ]);

  if (reviewsResult.errorMessage) {
    return {
      errorMessage: reviewsResult.errorMessage
    };
  }

  const reviews = reviewsResult.reviews ?? [];
  const myReviewText = resolveMyReviewText(reviews, currentUserId, myReviewResult.review);

  return {
    myReviewText,
    state: {
      currentUserId,
      displayMode: options.displayMode ?? "compact",
      isAuthenticated,
      reviews,
      reviewsLimit: options.reviewsLimit ?? 10,
      sort: "likes"
    }
  };
}

export function renderEntityReviewsSectionMarkup(
  state: EntityReviewsSectionState,
  myReviewText: string,
  statusMessage?: string,
  renderOptions: EntityReviewsSectionRenderOptions = {}
): string {
  const hideMyReviewWhenSaved = renderOptions.hideMyReviewWhenSaved !== false;
  const showReviewForm =
    renderOptions.showReviewForm ??
    !(hideMyReviewWhenSaved && hasSavedReviewText(myReviewText));
  const sortedReviews = sortEntityReviews(state.reviews, state.sort);
  const limitedReviews = sortedReviews.slice(0, state.reviewsLimit);
  const reviewsMarkup = renderReviewListMarkup(limitedReviews, state);
  const myReviewMarkup = renderMyReviewSection(myReviewText, state.isAuthenticated, {
    hideWhenSaved: hideMyReviewWhenSaved,
    showReviewForm
  });

  return `
    <section class="reviews-panel">
      ${myReviewMarkup}

      <div class="reviews-panel-header">
        <h2>Community reviews</h2>
        <label class="review-sort-label">
          Sort
          <select data-review-sort>
            <option value="likes"${state.sort === "likes" ? " selected" : ""}>Most helpful</option>
            <option value="newest"${state.sort === "newest" ? " selected" : ""}>Newest</option>
          </select>
        </label>
      </div>

      <div class="review-list-viewport" data-review-list-viewport>
        <div class="review-list" data-review-list>
          ${reviewsMarkup}
        </div>
      </div>
      ${
        sortedReviews.length > limitedReviews.length
          ? `<p class="muted-copy review-list-hint">Showing ${limitedReviews.length} of ${sortedReviews.length}. Change the limit in Settings.</p>`
          : limitedReviews.length > 1
            ? `<p class="muted-copy review-list-hint">Scroll to read more reviews.</p>`
            : ""
      }
      ${
        statusMessage
          ? `<p class="status-line success-line review-global-status">${escapeHtml(statusMessage)}</p>`
          : ""
      }
    </section>
  `;
}

function renderReviewListMarkup(reviews: ExtensionReview[], state: EntityReviewsSectionState): string {
  if (reviews.length === 0) {
    return `<p class="muted-copy">No community reviews yet.</p>`;
  }

  return reviews.map((review) => renderReviewCard(review, state)).join("");
}

function renderMyReviewSection(
  myReviewText: string,
  isAuthenticated: boolean,
  options: { hideWhenSaved: boolean; showReviewForm: boolean }
): string {
  if (hasSavedReviewText(myReviewText) && options.hideWhenSaved) {
    return "";
  }

  if (!isAuthenticated) {
    return `
      <section class="my-review-form">
        <h3>Your review</h3>
        <p class="muted-copy">Sign in to leave a text review.</p>
      </section>
    `;
  }

  if (!options.showReviewForm) {
    return "";
  }

  const saveReviewLabel = hasSavedReviewText(myReviewText) ? "Update review" : "Save review";

  return `
    <section class="my-review-form">
      <h3>Your review</h3>
      <textarea
        data-my-review-text
        maxlength="${MAX_REVIEW_TEXT_LENGTH}"
        rows="3"
        placeholder="Share useful context about this page..."
      ></textarea>
      <div class="my-review-form-footer">
        <p class="muted-copy review-length-hint">Up to ${MAX_REVIEW_TEXT_LENGTH} characters</p>
        <p
          class="review-length-counter ${reviewLengthCounterClass(myReviewText.length)}"
          data-review-length-counter
          aria-live="polite"
        >
          ${formatReviewLengthCounter(myReviewText.length)}
        </p>
      </div>
      <button type="button" class="primary-button" data-save-review>
        ${saveReviewLabel}
      </button>
      <p class="review-status" data-review-status hidden></p>
    </section>
  `;
}

function renderReviewCard(review: ExtensionReview, state: EntityReviewsSectionState): string {
  const isOwnReview = isReviewByCurrentUser(review.authorId, state.currentUserId);
  const likeClass = review.likedByCurrentUser ? " is-active" : "";
  const isCompact = state.displayMode === "compact";
  const displayText = isCompact ? formatReviewSnippet(review.text) : review.text;
  const cardClass = isCompact
    ? `review-card is-compact${isOwnReview ? " is-own-review" : ""}`
    : `review-card${isOwnReview ? " is-own-review" : ""}`;
  const canVote = state.isAuthenticated && !isOwnReview;

  return `
    <article class="${cardClass}" data-review-id="${escapeHtml(review.id)}">
      <p class="review-text">${escapeHtml(breakLongUnbrokenText(displayText))}</p>
      <div class="review-card-footer">
        <div class="review-vote-controls" role="group" aria-label="Review feedback">
          <button
            type="button"
            class="review-vote-button review-like-button${likeClass}"
            data-like-review="${escapeHtml(review.id)}"
            aria-pressed="${review.likedByCurrentUser}"
            ${canVote ? "" : "disabled"}
            title="${isOwnReview ? "You can't like your own review" : "Mark as helpful"}"
          >
            👍 ${review.likesCount}
          </button>
          <button
            type="button"
            class="review-vote-button review-unlike-button"
            data-unlike-review="${escapeHtml(review.id)}"
            ${canVote && review.likedByCurrentUser ? "" : "disabled"}
            title="${isOwnReview ? "You can't like your own review" : "Remove your like"}"
          >
            👎
          </button>
        </div>
        <span class="review-date">${
          isOwnReview ? `<span class="review-you-label">You</span> · ` : ""
        }${escapeHtml(formatReviewDate(review.updatedAt))}</span>
      </div>
    </article>
  `;
}

export function bindEntityReviewsSection(
  container: HTMLElement,
  entityId: string,
  initialState: EntityReviewsSectionState,
  initialMyReviewText: string,
  renderOptions: EntityReviewsSectionRenderOptions = {}
): void {
  let state = initialState;
  let myReviewText = initialMyReviewText;
  const hideMyReviewWhenSaved = renderOptions.hideMyReviewWhenSaved !== false;
  let showReviewForm =
    renderOptions.showReviewForm ??
    !(hideMyReviewWhenSaved && hasSavedReviewText(myReviewText));

  const rerenderList = (): void => {
    const listElement = container.querySelector<HTMLElement>("[data-review-list]");

    if (!listElement) {
      return;
    }

    const sortedReviews = sortEntityReviews(state.reviews, state.sort);
    const limitedReviews = sortedReviews.slice(0, state.reviewsLimit);
    listElement.innerHTML = renderReviewListMarkup(limitedReviews, state);

    bindReviewVoteButtons(listElement);
  };

  const bindReviewVoteButtons = (root: ParentNode): void => {
    root.querySelectorAll<HTMLButtonElement>("[data-like-review]").forEach((button) => {
      button.addEventListener("click", () => {
        const reviewId = button.dataset.likeReview;

        if (!reviewId) {
          return;
        }

        void toggleReviewLike(reviewId, button);
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-unlike-review]").forEach((button) => {
      button.addEventListener("click", () => {
        const reviewId = button.dataset.unlikeReview;

        if (!reviewId) {
          return;
        }

        void removeReviewLike(reviewId);
      });
    });
  };

  async function toggleReviewLike(reviewId: string, button: HTMLButtonElement): Promise<void> {
    const review = state.reviews.find((item) => item.id === reviewId);

    if (!review || isReviewByCurrentUser(review.authorId, state.currentUserId)) {
      return;
    }

    button.disabled = true;
    const result = review.likedByCurrentUser
      ? await unlikeEntityReview(reviewId)
      : await likeEntityReview(reviewId);
    button.disabled = false;

    if (!result.review) {
      setReviewStatus(result.errorMessage ?? "Could not update like.", "error");
      return;
    }

    state = {
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? result.review! : item))
    };
    rerenderList();
  }

  async function removeReviewLike(reviewId: string): Promise<void> {
    const review = state.reviews.find((item) => item.id === reviewId);

    if (
      !review?.likedByCurrentUser ||
      isReviewByCurrentUser(review.authorId, state.currentUserId)
    ) {
      return;
    }

    const result = await unlikeEntityReview(reviewId);

    if (!result.review) {
      setReviewStatus(result.errorMessage ?? "Could not remove like.", "error");
      return;
    }

    state = {
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? result.review! : item))
    };
    rerenderList();
  }

  function setReviewStatus(message: string, tone: "default" | "error" | "success"): void {
    const statusElement = container.querySelector<HTMLParagraphElement>("[data-review-status]");

    if (!statusElement) {
      return;
    }

    statusElement.hidden = !message;
    statusElement.textContent = message;
    statusElement.classList.toggle("status-copy-error", tone === "error");
    statusElement.classList.toggle("status-copy-success", tone === "success");
  }

  container.querySelector<HTMLSelectElement>("[data-review-sort]")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;

    if (value !== "likes" && value !== "newest") {
      return;
    }

    state = {
      ...state,
      sort: value
    };
    rerenderList();
  });

  container.querySelector<HTMLButtonElement>("[data-save-review]")?.addEventListener("click", () => {
    void saveMyReview();
  });

  async function saveMyReview(): Promise<void> {
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-my-review-text]");
    const text = textarea?.value.trim() ?? "";

    if (!text) {
      setReviewStatus("Write something before saving.", "error");
      return;
    }

    if (!isReviewTextWithinLimit(text)) {
      setReviewStatus(`Review must be ${MAX_REVIEW_TEXT_LENGTH} characters or fewer.`, "error");
      return;
    }

    setReviewStatus("Saving review...", "default");
    const result = await upsertMyEntityReview(entityId, text);

    if (!result.review) {
      setReviewStatus(result.errorMessage ?? "Could not save review.", "error");
      return;
    }

    myReviewText = result.review.text;
    showReviewForm = false;
    const existingIndex = state.reviews.findIndex((item) => item.id === result.review!.id);

    state = {
      ...state,
      reviews:
        existingIndex === -1
          ? [result.review, ...state.reviews]
          : state.reviews.map((item, index) => (index === existingIndex ? result.review! : item))
    };

    if (hideMyReviewWhenSaved) {
      container.querySelector(".my-review-form")?.remove();
    } else if (textarea) {
      textarea.value = result.review.text;
      syncReviewLengthCounter();
    }

    setReviewStatus("Review saved.", "success");
    rerenderList();
  }

  bindReviewVoteButtons(container);

  const textarea = container.querySelector<HTMLTextAreaElement>("[data-my-review-text]");
  const lengthCounter = container.querySelector<HTMLParagraphElement>("[data-review-length-counter]");

  const syncReviewLengthCounter = (): void => {
    if (!textarea || !lengthCounter) {
      return;
    }

    const length = textarea.value.length;
    lengthCounter.textContent = formatReviewLengthCounter(length);
    lengthCounter.className = `review-length-counter ${reviewLengthCounterClass(length)}`.trim();
  };

  if (textarea) {
    textarea.value = myReviewText;
    syncReviewLengthCounter();
    textarea.addEventListener("input", syncReviewLengthCounter);
  }
}

function formatReviewDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
