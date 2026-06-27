import { breakLongUnbrokenText } from "../../shared/break-long-text.js";
import type { PopupReviewDisplayMode } from "../../shared/preferences.js";
import { isReviewByCurrentUser } from "../../shared/review-ownership.js";
import { formatReviewSnippet } from "../../shared/review-snippet.js";
import type { CardEntityReview } from "./fetch-entity-reviews.js";
import { likeEntityReview, unlikeEntityReview } from "./fetch-entity-reviews.js";

export type CardReviewSort = "likes" | "newest";

export interface CardCommunityReviewsState {
  currentUserId?: string;
  displayMode: PopupReviewDisplayMode;
  isAuthenticated: boolean;
  reviews: CardEntityReview[];
  reviewsLimit: number;
  sort: CardReviewSort;
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function sortReviews(reviews: CardEntityReview[], sort: CardReviewSort): CardEntityReview[] {
  const copy = [...reviews];

  if (sort === "newest") {
    return copy.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  return copy.sort((left, right) => {
    if (right.likesCount !== left.likesCount) {
      return right.likesCount - left.likesCount;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
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

function renderReviewCard(review: CardEntityReview, state: CardCommunityReviewsState): string {
  const isOwnReview = isReviewByCurrentUser(review.authorId, state.currentUserId);
  const likeClass = review.likedByCurrentUser ? " is-active" : "";
  const isCompact = state.displayMode === "compact";
  const displayText = isCompact ? formatReviewSnippet(review.text) : review.text;
  const cardClass = isCompact
    ? `reviewo-review-card is-compact${isOwnReview ? " is-own-review" : ""}`
    : `reviewo-review-card${isOwnReview ? " is-own-review" : ""}`;
  const canVote = state.isAuthenticated && !isOwnReview;

  return `
    <article class="${cardClass}" data-review-id="${escapeHtmlText(review.id)}">
      <p class="reviewo-review-text">${escapeHtmlText(breakLongUnbrokenText(displayText))}</p>
      <div class="reviewo-review-card-footer">
        <div class="reviewo-review-vote-controls" role="group" aria-label="Review feedback">
          <button
            type="button"
            class="reviewo-review-vote-button reviewo-review-like-button${likeClass}"
            data-like-review="${escapeHtmlText(review.id)}"
            aria-pressed="${review.likedByCurrentUser}"
            ${canVote ? "" : "disabled"}
            title="${isOwnReview ? "You can't like your own review" : "Mark as helpful"}"
          >
            👍 ${review.likesCount}
          </button>
          <button
            type="button"
            class="reviewo-review-vote-button reviewo-review-unlike-button"
            data-unlike-review="${escapeHtmlText(review.id)}"
            ${canVote && review.likedByCurrentUser ? "" : "disabled"}
            title="${isOwnReview ? "You can't like your own review" : "Remove your like"}"
          >
            👎
          </button>
        </div>
        <span class="reviewo-review-date">${
          isOwnReview
            ? `<span class="reviewo-review-you-label">You</span> · `
            : ""
        }${escapeHtmlText(formatReviewDate(review.updatedAt))}</span>
      </div>
    </article>
  `;
}

function renderReviewListMarkup(reviews: CardEntityReview[], state: CardCommunityReviewsState): string {
  if (reviews.length === 0) {
    return `<p class="reviewo-muted-copy">No community reviews yet.</p>`;
  }

  return reviews.map((review) => renderReviewCard(review, state)).join("");
}

export function renderCardCommunityReviewsMarkup(
  state: CardCommunityReviewsState,
  errorMessage?: string | null
): string {
  const sortedReviews = sortReviews(state.reviews, state.sort);
  const limitedReviews = sortedReviews.slice(0, state.reviewsLimit);
  const reviewsMarkup = renderReviewListMarkup(limitedReviews, state);

  return `
    <section class="reviewo-reviews-panel">
      <div class="reviewo-reviews-panel-header">
        <p class="reviewo-rate-label">Community reviews</p>
        <label class="reviewo-review-sort-label">
          Sort
          <select data-review-sort>
            <option value="likes"${state.sort === "likes" ? " selected" : ""}>Most helpful</option>
            <option value="newest"${state.sort === "newest" ? " selected" : ""}>Newest</option>
          </select>
        </label>
      </div>
      ${
        errorMessage
          ? `<p class="reviewo-muted-copy reviewo-reviews-error">${escapeHtmlText(errorMessage)}</p>`
          : ""
      }
      <div class="reviewo-review-list-viewport" data-review-list-viewport>
        <div class="reviewo-review-list" data-review-list>
          ${reviewsMarkup}
        </div>
      </div>
      ${
        sortedReviews.length > limitedReviews.length
          ? `<p class="reviewo-muted-copy reviewo-review-list-hint">Showing ${limitedReviews.length} of ${sortedReviews.length}. Change the limit in Settings.</p>`
          : limitedReviews.length > 1
            ? `<p class="reviewo-muted-copy reviewo-review-list-hint">Scroll to read more reviews.</p>`
            : ""
      }
    </section>
  `;
}

export function bindCardCommunityReviews(
  container: ParentNode,
  getState: () => CardCommunityReviewsState,
  onStateChange: (nextState: CardCommunityReviewsState) => void
): void {
  const rerenderList = (): void => {
    const listElement = container.querySelector<HTMLElement>("[data-review-list]");

    if (!listElement) {
      return;
    }

    const state = getState();
    const sortedReviews = sortReviews(state.reviews, state.sort);
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
    const state = getState();
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
      return;
    }

    onStateChange({
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? result.review! : item))
    });
    rerenderList();
  }

  async function removeReviewLike(reviewId: string): Promise<void> {
    const state = getState();
    const review = state.reviews.find((item) => item.id === reviewId);

    if (!review?.likedByCurrentUser || isReviewByCurrentUser(review.authorId, state.currentUserId)) {
      return;
    }

    const result = await unlikeEntityReview(reviewId);

    if (!result.review) {
      return;
    }

    onStateChange({
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? result.review! : item))
    });
    rerenderList();
  }

  container.querySelector<HTMLSelectElement>("[data-review-sort]")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;

    if (value !== "likes" && value !== "newest") {
      return;
    }

    onStateChange({
      ...getState(),
      sort: value
    });
    rerenderList();
  });

  bindReviewVoteButtons(container);
}
