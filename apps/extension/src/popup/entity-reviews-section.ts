import type { TranslateFn } from "@reviewo/i18n";

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
  isReviewTextWithinLimit,
  MAX_REVIEW_TEXT_LENGTH,
  reviewLengthCounterClass
} from "../shared/review-limits.js";
import { formatReviewSnippet } from "../shared/review-snippet.js";
import {
  bindReviewCarouselNav,
  clampReviewCarouselIndex,
  renderReviewCarouselNavMarkup,
  updateReviewCarouselNav
} from "../shared/review-carousel.js";
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
  t: TranslateFn,
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
  const reviewsMarkup = renderReviewAtIndexMarkup(t, limitedReviews, 0, state);
  const carouselNavMarkup = renderReviewCarouselNavMarkup(t, 0, limitedReviews.length, {
    classPrefix: "review",
    escapeHtml
  });
  const myReviewMarkup = renderMyReviewSection(t, myReviewText, state.isAuthenticated, {
    hideWhenSaved: hideMyReviewWhenSaved,
    showReviewForm
  });

  return `
    <section class="reviews-panel">
      ${myReviewMarkup}

      <div class="reviews-panel-header">
        <h2>${escapeHtml(t("reviews.community.title"))}</h2>
        <label class="review-sort-label">
          ${escapeHtml(t("reviews.sort.label"))}
          <select data-review-sort>
            <option value="likes"${state.sort === "likes" ? " selected" : ""}>${escapeHtml(t("reviews.sort.mostHelpful"))}</option>
            <option value="newest"${state.sort === "newest" ? " selected" : ""}>${escapeHtml(t("reviews.sort.newest"))}</option>
          </select>
        </label>
      </div>

      <div class="review-carousel" data-review-carousel>
        <div class="review-list-viewport" data-review-list-viewport>
          <div class="review-list" data-review-list>
            ${reviewsMarkup}
          </div>
        </div>
        ${carouselNavMarkup}
      </div>
      ${
        sortedReviews.length > limitedReviews.length
          ? `<p class="muted-copy review-list-hint">${escapeHtml(t("reviews.list.showingLimited", { shown: limitedReviews.length, total: sortedReviews.length }))}</p>`
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

function renderReviewAtIndexMarkup(
  t: TranslateFn,
  reviews: ExtensionReview[],
  index: number,
  state: EntityReviewsSectionState
): string {
  if (reviews.length === 0) {
    return `<p class="muted-copy">${escapeHtml(t("reviews.community.empty"))}</p>`;
  }

  const review = reviews[clampReviewCarouselIndex(index, reviews.length)]!;

  return renderReviewCard(t, review, state);
}

function renderMyReviewSection(
  t: TranslateFn,
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
        <h3>${escapeHtml(t("reviews.myReview.title"))}</h3>
        <button type="button" class="text-link sign-in-cta" data-open-auth-prompt>
          ${escapeHtml(t("reviews.myReview.signInCta"))}
        </button>
      </section>
    `;
  }

  if (!options.showReviewForm) {
    return "";
  }

  const saveReviewLabel = hasSavedReviewText(myReviewText)
    ? t("reviews.myReview.update")
    : t("reviews.myReview.save");

  return `
    <section class="my-review-form">
      <h3>${escapeHtml(t("reviews.myReview.title"))}</h3>
      <textarea
        data-my-review-text
        maxlength="${MAX_REVIEW_TEXT_LENGTH}"
        rows="3"
        placeholder="${escapeHtml(t("reviews.myReview.placeholder"))}"
      ></textarea>
      <div class="my-review-form-footer">
        <p class="muted-copy review-length-hint">${escapeHtml(t("reviews.myReview.charLimitHint", { max: MAX_REVIEW_TEXT_LENGTH }))}</p>
        <p
          class="review-length-counter ${reviewLengthCounterClass(myReviewText.length)}"
          data-review-length-counter
          aria-live="polite"
        >
          ${escapeHtml(t("reviews.myReview.charCounter", { length: myReviewText.length, max: MAX_REVIEW_TEXT_LENGTH }))}
        </p>
      </div>
      <button type="button" class="primary-button" data-save-review>
        ${escapeHtml(saveReviewLabel)}
      </button>
      <p class="review-status" data-review-status hidden></p>
    </section>
  `;
}

function renderReviewCard(t: TranslateFn, review: ExtensionReview, state: EntityReviewsSectionState): string {
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
        <div class="review-vote-controls" role="group" aria-label="${escapeHtml(t("reviews.vote.groupAriaLabel"))}">
          <button
            type="button"
            class="review-vote-button review-like-button${likeClass}"
            data-like-review="${escapeHtml(review.id)}"
            aria-pressed="${review.likedByCurrentUser}"
            ${canVote ? "" : "disabled"}
            title="${escapeHtml(
              isOwnReview
                ? t("reviews.vote.ownReviewTooltip")
                : review.likedByCurrentUser
                  ? t("reviews.vote.unlikeTooltip")
                  : t("reviews.vote.likeTooltip")
            )}"
          >
            👍 ${review.likesCount}
          </button>
          <button
            type="button"
            class="review-vote-button review-unlike-button"
            data-unlike-review="${escapeHtml(review.id)}"
            ${canVote && review.likedByCurrentUser ? "" : "disabled"}
            title="${escapeHtml(isOwnReview ? t("reviews.vote.ownReviewTooltip") : t("reviews.vote.unlikeTooltip"))}"
          >
            👎
          </button>
        </div>
        <span class="review-date">${
          isOwnReview ? `<span class="review-you-label">${escapeHtml(t("reviews.author.you"))}</span> · ` : ""
        }${escapeHtml(formatReviewDate(review.updatedAt))}</span>
      </div>
    </article>
  `;
}

export function bindEntityReviewsSection(
  t: TranslateFn,
  container: HTMLElement,
  entityId: string,
  initialState: EntityReviewsSectionState,
  initialMyReviewText: string,
  renderOptions: EntityReviewsSectionRenderOptions = {}
): void {
  let state = initialState;
  let myReviewText = initialMyReviewText;
  let activeReviewIndex = 0;
  const hideMyReviewWhenSaved = renderOptions.hideMyReviewWhenSaved !== false;
  let showReviewForm =
    renderOptions.showReviewForm ??
    !(hideMyReviewWhenSaved && hasSavedReviewText(myReviewText));

  const getLimitedReviews = (): ExtensionReview[] => {
    const sortedReviews = sortEntityReviews(state.reviews, state.sort);
    return sortedReviews.slice(0, state.reviewsLimit);
  };

  const rerenderList = (): void => {
    const listElement = container.querySelector<HTMLElement>("[data-review-list]");
    const carousel = container.querySelector<HTMLElement>("[data-review-carousel]");

    if (!listElement) {
      return;
    }

    const limitedReviews = getLimitedReviews();
    activeReviewIndex = clampReviewCarouselIndex(activeReviewIndex, limitedReviews.length);
    listElement.innerHTML = renderReviewAtIndexMarkup(t, limitedReviews, activeReviewIndex, state);
    listElement.querySelector<HTMLElement>(".review-text")?.scrollTo({ top: 0 });

    if (carousel) {
      const existingNav = carousel.querySelector("[data-review-carousel-nav]");
      const navMarkup = renderReviewCarouselNavMarkup(t, activeReviewIndex, limitedReviews.length, {
        classPrefix: "review",
        escapeHtml
      });

      if (navMarkup) {
        if (existingNav) {
          existingNav.outerHTML = navMarkup;
        } else {
          carousel.insertAdjacentHTML("beforeend", navMarkup);
        }

        updateReviewCarouselNav(carousel, t, activeReviewIndex, limitedReviews.length);
      } else {
        existingNav?.remove();
      }
    }
  };


  let pendingVoteReviewId: string | null = null;

  const applyOptimisticReviewVote = (
    review: ExtensionReview,
    willLike: boolean
  ): ExtensionReview => ({
    ...review,
    likedByCurrentUser: willLike,
    likesCount: Math.max(0, review.likesCount + (willLike ? 1 : -1))
  });

  const updateReviewVoteInPlace = (review: ExtensionReview): void => {
    const card = container.querySelector<HTMLElement>(`[data-review-id="${CSS.escape(review.id)}"]`);

    if (!card) {
      return;
    }

    const isOwnReview = isReviewByCurrentUser(review.authorId, state.currentUserId);
    const canVote = state.isAuthenticated && !isOwnReview;
    const likeButton = card.querySelector<HTMLButtonElement>("[data-like-review]");
    const unlikeButton = card.querySelector<HTMLButtonElement>("[data-unlike-review]");

    if (likeButton) {
      likeButton.classList.toggle("is-active", review.likedByCurrentUser);
      likeButton.setAttribute("aria-pressed", String(review.likedByCurrentUser));
      likeButton.disabled = !canVote;
      likeButton.title = isOwnReview
        ? t("reviews.vote.ownReviewTooltip")
        : review.likedByCurrentUser
          ? t("reviews.vote.unlikeTooltip")
          : t("reviews.vote.likeTooltip");
      likeButton.textContent = `👍 ${review.likesCount}`;
    }

    if (unlikeButton) {
      unlikeButton.disabled = !canVote || !review.likedByCurrentUser;
      unlikeButton.title = isOwnReview
        ? t("reviews.vote.ownReviewTooltip")
        : t("reviews.vote.unlikeTooltip");
    }
  };

  async function handleReviewVote(reviewId: string): Promise<void> {
    if (pendingVoteReviewId === reviewId) {
      return;
    }

    const review = state.reviews.find((item) => item.id === reviewId);

    if (
      !review ||
      !state.isAuthenticated ||
      isReviewByCurrentUser(review.authorId, state.currentUserId)
    ) {
      return;
    }

    const willLike = !review.likedByCurrentUser;
    const snapshot = state;
    const optimisticReview = applyOptimisticReviewVote(review, willLike);

    pendingVoteReviewId = reviewId;
    state = {
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? optimisticReview : item))
    };
    updateReviewVoteInPlace(optimisticReview);

    const result = willLike ? await likeEntityReview(reviewId) : await unlikeEntityReview(reviewId);
    pendingVoteReviewId = null;

    if (!result.review) {
      state = snapshot;
      updateReviewVoteInPlace(review);
      setReviewStatus(
        willLike ? t("reviews.vote.likeError") : t("reviews.vote.unlikeError"),
        "error"
      );
      return;
    }

    state = {
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? result.review! : item))
    };
    updateReviewVoteInPlace(result.review);
    setReviewStatus("", "default");
  }

  const bindReviewVoteControls = (root: ParentNode): void => {
    if (!(root instanceof HTMLElement) || root.dataset.reviewVoteControlsBound === "true") {
      return;
    }

    root.dataset.reviewVoteControlsBound = "true";

    root.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const likeButton = event.target.closest<HTMLButtonElement>("[data-like-review]:not(:disabled)");

      if (likeButton) {
        const reviewId = likeButton.dataset.likeReview;

        if (reviewId) {
          void handleReviewVote(reviewId);
        }

        return;
      }

      const unlikeButton = event.target.closest<HTMLButtonElement>(
        "[data-unlike-review]:not(:disabled)"
      );

      if (unlikeButton) {
        const reviewId = unlikeButton.dataset.unlikeReview;

        if (reviewId) {
          void handleReviewVote(reviewId);
        }
      }
    });
  };

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
    activeReviewIndex = 0;
    rerenderList();
  });

  container.querySelector<HTMLButtonElement>("[data-save-review]")?.addEventListener("click", () => {
    void saveMyReview();
  });

  async function saveMyReview(): Promise<void> {
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-my-review-text]");
    const text = textarea?.value.trim() ?? "";

    if (!text) {
      setReviewStatus(t("reviews.save.emptyError"), "error");
      return;
    }

    if (!isReviewTextWithinLimit(text)) {
      setReviewStatus(t("reviews.save.tooLongError", { max: MAX_REVIEW_TEXT_LENGTH }), "error");
      return;
    }

    setReviewStatus(t("reviews.save.saving"), "default");
    const result = await upsertMyEntityReview(entityId, text);

    if (!result.review) {
      setReviewStatus(result.errorMessage ?? t("reviews.save.error"), "error");
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

    setReviewStatus(t("reviews.save.success"), "success");
    rerenderList();
  }

  bindReviewVoteControls(container);
  bindReviewCarouselNav(container, {
    getIndex: () => activeReviewIndex,
    getTotal: () => getLimitedReviews().length,
    onNavigate: (nextIndex) => {
      activeReviewIndex = nextIndex;
      rerenderList();
    }
  });

  const textarea = container.querySelector<HTMLTextAreaElement>("[data-my-review-text]");
  const lengthCounter = container.querySelector<HTMLParagraphElement>("[data-review-length-counter]");

  const syncReviewLengthCounter = (): void => {
    if (!textarea || !lengthCounter) {
      return;
    }

    const length = textarea.value.length;
    lengthCounter.textContent = t("reviews.myReview.charCounter", {
      length,
      max: MAX_REVIEW_TEXT_LENGTH
    });
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
