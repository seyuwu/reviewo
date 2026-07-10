import type { TranslateFn } from "@reviewo/i18n";

import { breakLongUnbrokenText } from "../../shared/break-long-text.js";
import type { PopupReviewDisplayMode } from "../../shared/preferences.js";
import { isReviewByCurrentUser } from "../../shared/review-ownership.js";
import { formatReviewSnippet } from "../../shared/review-snippet.js";
import {
  bindReviewCarouselNav,
  clampReviewCarouselIndex,
  renderReviewCarouselNavMarkup,
  updateReviewCarouselNav
} from "../../shared/review-carousel.js";
import { resumeAutoDismiss, suspendAutoDismiss, type AutoDismissHost } from "./auto-dismiss.js";
import { animateRatingCardShellHeight } from "./card-shell-animation.js";
import type { CardEntityReview } from "./fetch-entity-reviews.js";
import { likeEntityReview, unlikeEntityReview, upsertMyEntityReview } from "./fetch-entity-reviews.js";
import { MAX_REVIEW_TEXT_LENGTH } from "../../shared/review-limits.js";

export type CardReviewSort = "likes" | "newest";

export interface CardCommunityReviewsState {
  contentLocale: "en" | "ru";
  currentUserId?: string;
  displayMode: PopupReviewDisplayMode;
  entityId: string;
  hasCurrentUserReview: boolean;
  isAuthenticated: boolean;
  myReviewText: string;
  reviews: CardEntityReview[];
  reviewsLimit: number;
  showAllReviews: boolean;
  sort: CardReviewSort;
}

export interface CardCommunityReviewsActions {
  onToggleShowAll?: () => void | Promise<void>;
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

function renderReviewCard(
  t: TranslateFn,
  review: CardEntityReview,
  state: CardCommunityReviewsState
): string {
  const isOwnReview = isReviewByCurrentUser(review);
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
        <div class="reviewo-review-vote-controls" role="group" aria-label="${escapeHtmlAttribute(t("reviews.vote.groupAriaLabel"))}">
          <button
            type="button"
            class="reviewo-review-vote-button reviewo-review-like-button${likeClass}"
            data-like-review="${escapeHtmlText(review.id)}"
            aria-pressed="${review.likedByCurrentUser}"
            ${canVote ? "" : "disabled"}
            title="${escapeHtmlAttribute(
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
            class="reviewo-review-vote-button reviewo-review-unlike-button"
            data-unlike-review="${escapeHtmlText(review.id)}"
            ${canVote && review.likedByCurrentUser ? "" : "disabled"}
            title="${escapeHtmlAttribute(isOwnReview ? t("reviews.vote.ownReviewTooltip") : t("reviews.vote.unlikeTooltip"))}"
          >
            👎
          </button>
        </div>
        <span class="reviewo-review-date">${
          isOwnReview
            ? `<span class="reviewo-review-you-label">${escapeHtmlText(t("reviews.author.you"))}</span> · `
            : ""
        }${escapeHtmlText(formatReviewDate(review.updatedAt))}</span>
      </div>
    </article>
  `;
}

function renderReviewAtIndexMarkup(
  t: TranslateFn,
  reviews: CardEntityReview[],
  index: number,
  state: CardCommunityReviewsState
): string {
  if (reviews.length === 0) {
    return `<p class="reviewo-muted-copy">${escapeHtmlText(t("reviews.community.empty"))}</p>`;
  }

  const review = reviews[clampReviewCarouselIndex(index, reviews.length)]!;

  return renderReviewCard(t, review, state);
}

export interface CardCommunityReviewsCarouselIndex {
  getActiveIndex: () => number;
  setActiveIndex: (index: number) => void;
}

function renderReviewEditorMarkup(t: TranslateFn, text: string, statusMessage = ""): string {
  return `
    <article class="reviewo-review-card reviewo-review-editor-card">
      <textarea
        class="reviewo-review-editor"
        data-review-editor-text
        maxlength="${MAX_REVIEW_TEXT_LENGTH}"
        placeholder="${escapeHtmlAttribute(t("reviews.myReview.placeholder"))}"
      >${escapeHtmlText(text)}</textarea>
      <p class="reviewo-review-editor-status${statusMessage ? " is-visible" : ""}" data-review-editor-status>
        ${escapeHtmlText(statusMessage)}
      </p>
    </article>
  `;
}

function renderReviewCtaMarkup(t: TranslateFn, state: CardCommunityReviewsState, isWritingReview: boolean): string {
  if (state.hasCurrentUserReview) {
    return "";
  }

  if (isWritingReview) {
    return `
      <div class="reviewo-review-write-actions" data-review-write-actions>
        <button type="button" class="reviewo-review-publish-button" data-review-publish>
          ${escapeHtmlText(t("reviews.myReview.publish"))}
        </button>
        <button type="button" class="reviewo-review-cancel-button" data-review-cancel>
          ${escapeHtmlText(t("reviews.myReview.cancel"))}
        </button>
      </div>
    `;
  }

  return `
    <button
      type="button"
      class="reviewo-review-write-cta"
      data-review-write
    >
      ${escapeHtmlText(t("reviews.myReview.leave"))}
    </button>
  `;
}

function renderReviewCarouselActionsMarkup(
  t: TranslateFn,
  state: CardCommunityReviewsState,
  activeIndex: number,
  total: number,
  isWritingReview = false
): string {
  const carouselNavMarkup = isWritingReview
    ? ""
    : renderReviewCarouselNavMarkup(t, activeIndex, total, {
        classPrefix: "reviewo-review",
        escapeHtml: escapeHtmlAttribute
      });
  const reviewCtaMarkup = renderReviewCtaMarkup(t, state, isWritingReview);

  if (!carouselNavMarkup && !reviewCtaMarkup) {
    return "";
  }

  return `
    <div class="reviewo-review-carousel-actions" data-review-carousel-actions>
      ${carouselNavMarkup}
      ${reviewCtaMarkup}
    </div>
  `;
}

export function renderCardCommunityReviewsMarkup(
  t: TranslateFn,
  state: CardCommunityReviewsState,
  errorMessage?: string | null,
  initialIndex = 0
): string {
  const sortedReviews = sortReviews(state.reviews, state.sort);
  const limitedReviews = sortedReviews.slice(0, state.reviewsLimit);
  const activeIndex = clampReviewCarouselIndex(initialIndex, limitedReviews.length);
  const reviewsMarkup = renderReviewAtIndexMarkup(t, limitedReviews, activeIndex, state);
  const carouselActionsMarkup = renderReviewCarouselActionsMarkup(t, state, activeIndex, limitedReviews.length);
  const reviewsTitle = state.showAllReviews
    ? t("reviews.community.title")
    : t("web.entity.reviewsLocaleTitle", {
        locale: state.contentLocale === "ru" ? t("locale.ru") : t("locale.en")
      });
  const showAllLabel = state.showAllReviews
    ? t("web.locale.showLocaleOnly", {
        locale: state.contentLocale === "ru" ? t("locale.ru") : t("locale.en")
      })
    : t("web.locale.showAllLanguages");

  return `
    <section class="reviewo-reviews-panel">
      <div class="reviewo-reviews-panel-header">
        <p class="reviewo-rate-label">${escapeHtmlText(reviewsTitle)}</p>
        <div class="reviewo-reviews-panel-meta">
          <button type="button" class="reviewo-locale-toggle-button" data-show-all-reviews>
            ${escapeHtmlText(showAllLabel)}
          </button>
          <label class="reviewo-review-sort-label">
          ${escapeHtmlText(t("reviews.sort.label"))}
          <select data-review-sort>
            <option value="likes"${state.sort === "likes" ? " selected" : ""}>${escapeHtmlText(t("reviews.sort.mostHelpful"))}</option>
            <option value="newest"${state.sort === "newest" ? " selected" : ""}>${escapeHtmlText(t("reviews.sort.newest"))}</option>
          </select>
        </label>
        </div>
      </div>
      ${
        errorMessage
          ? `<p class="reviewo-muted-copy reviewo-reviews-error">${escapeHtmlText(errorMessage)}</p>`
          : ""
      }
      <div class="reviewo-review-carousel" data-review-carousel>
        <div class="reviewo-review-list-viewport" data-review-list-viewport>
          <div class="reviewo-review-list" data-review-list>
            ${reviewsMarkup}
          </div>
        </div>
        ${carouselActionsMarkup}
      </div>
      ${
        sortedReviews.length > limitedReviews.length
          ? `<p class="reviewo-muted-copy reviewo-review-list-hint">${escapeHtmlText(t("reviews.list.showingLimited", { shown: limitedReviews.length, total: sortedReviews.length }))}</p>`
          : ""
      }
    </section>
  `;
}

export function bindCardCommunityReviews(
  container: ParentNode,
  t: TranslateFn,
  getState: () => CardCommunityReviewsState,
  onStateChange: (nextState: CardCommunityReviewsState) => void,
  actions: CardCommunityReviewsActions = {},
  carouselIndex?: CardCommunityReviewsCarouselIndex
): void {
  let isWritingReview = false;
  let draftReviewText = getState().myReviewText;
  let pendingReviewSave = false;

  const syncActiveReviewIndex = (index: number): number => {
    const limitedReviews = getLimitedReviews();
    const nextIndex = clampReviewCarouselIndex(index, limitedReviews.length);
    carouselIndex?.setActiveIndex(nextIndex);

    return nextIndex;
  };

  const getLimitedReviews = (): CardEntityReview[] => {
    const state = getState();
    const sortedReviews = sortReviews(state.reviews, state.sort);
    return sortedReviews.slice(0, state.reviewsLimit);
  };

  let activeReviewIndex = syncActiveReviewIndex(carouselIndex?.getActiveIndex() ?? 0);

  const setActiveReviewIndex = (index: number): void => {
    activeReviewIndex = syncActiveReviewIndex(index);
  };
  const cardHost = getCardHost(container);

  const renderMainPanelMarkup = (state: CardCommunityReviewsState, limitedReviews: CardEntityReview[]): string => {
    return isWritingReview
      ? renderReviewEditorMarkup(t, draftReviewText)
      : renderReviewAtIndexMarkup(t, limitedReviews, activeReviewIndex, state);
  };

  const rerenderList = (options?: { animateShell?: boolean; focusEditor?: boolean }): void => {
    const listElement = container.querySelector<HTMLElement>("[data-review-list]");
    const carousel = container.querySelector<HTMLElement>("[data-review-carousel]");

    if (!listElement) {
      return;
    }

    const state = getState();
    const limitedReviews = getLimitedReviews();
    activeReviewIndex = clampReviewCarouselIndex(activeReviewIndex, limitedReviews.length);
    carouselIndex?.setActiveIndex(activeReviewIndex);
    listElement.innerHTML = renderMainPanelMarkup(state, limitedReviews);
    listElement.querySelector<HTMLElement>(".reviewo-review-text")?.scrollTo({ top: 0 });

    if (carousel) {
      const existingActions = carousel.querySelector("[data-review-carousel-actions]");
      const actionsMarkup = renderReviewCarouselActionsMarkup(
        t,
        state,
        activeReviewIndex,
        limitedReviews.length,
        isWritingReview
      );

      if (actionsMarkup) {
        if (existingActions) {
          existingActions.outerHTML = actionsMarkup;
        } else {
          carousel.insertAdjacentHTML("beforeend", actionsMarkup);
        }

        updateReviewCarouselNav(carousel, t, activeReviewIndex, limitedReviews.length);
      } else {
        existingActions?.remove();
      }
    }

    const cardShell = container.closest<HTMLElement>(".reviewo-card-shell");

    if (
      cardShell &&
      !cardShell.classList.contains("is-chat-expanded") &&
      options?.animateShell !== false
    ) {
      animateRatingCardShellHeight(cardShell);
    }

    bindReviewEditorKeyboardGuard(listElement.querySelector<HTMLElement>("[data-review-editor-text]"));

    if (options?.focusEditor) {
      listElement.querySelector<HTMLTextAreaElement>("[data-review-editor-text]")?.focus();
    }
  };


  let pendingVoteReviewId: string | null = null;

  const applyOptimisticReviewVote = (
    review: CardEntityReview,
    willLike: boolean
  ): CardEntityReview => ({
    ...review,
    likedByCurrentUser: willLike,
    likesCount: Math.max(0, review.likesCount + (willLike ? 1 : -1))
  });

  const updateReviewVoteInPlace = (review: CardEntityReview): void => {
    const state = getState();
    const card = container.querySelector<HTMLElement>(
      `[data-review-id="${CSS.escape(review.id)}"]`
    );

    if (!card) {
      return;
    }

    const isOwnReview = isReviewByCurrentUser(review);
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

    const state = getState();
    const review = state.reviews.find((item) => item.id === reviewId);

    if (
      !review ||
      !state.isAuthenticated ||
      isReviewByCurrentUser(review)
    ) {
      return;
    }

    const willLike = !review.likedByCurrentUser;
    const snapshot = state;
    const optimisticReview = applyOptimisticReviewVote(review, willLike);

    pendingVoteReviewId = reviewId;
    onStateChange({
      ...state,
      reviews: state.reviews.map((item) => (item.id === reviewId ? optimisticReview : item))
    });
    updateReviewVoteInPlace(optimisticReview);

    const result = willLike ? await likeEntityReview(reviewId) : await unlikeEntityReview(reviewId);
    pendingVoteReviewId = null;

    if (!result.review) {
      onStateChange(snapshot);
      updateReviewVoteInPlace(review);
      return;
    }

    onStateChange({
      ...getState(),
      reviews: getState().reviews.map((item) => (item.id === reviewId ? result.review! : item))
    });
    updateReviewVoteInPlace(result.review);
  }

  function updateReviewEditorStatus(message: string, isError = false): void {
    const status = container.querySelector<HTMLElement>("[data-review-editor-status]");

    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.toggle("is-visible", Boolean(message));
    status.classList.toggle("is-error", isError);
  }

  function startWritingReview(): void {
    const state = getState();

    isWritingReview = true;
    draftReviewText = state.myReviewText;
    if (cardHost) {
      suspendAutoDismiss(cardHost as AutoDismissHost);
    }
    rerenderList({ focusEditor: state.isAuthenticated });

    if (!state.isAuthenticated) {
      updateReviewEditorStatus(t("reviews.myReview.signInCta"), true);
    }
  }

  function cancelWritingReview(): void {
    isWritingReview = false;
    draftReviewText = getState().myReviewText;
    if (cardHost) {
      resumeAutoDismiss(cardHost as AutoDismissHost);
    }
    rerenderList();
  }

  async function publishReview(): Promise<void> {
    if (pendingReviewSave) {
      return;
    }

    const state = getState();
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-review-editor-text]");
    const text = textarea?.value.trim() ?? "";

    if (!state.isAuthenticated) {
      updateReviewEditorStatus(t("reviews.myReview.signInCta"), true);
      return;
    }

    if (!text) {
      updateReviewEditorStatus(t("reviews.save.emptyError"), true);
      return;
    }

    if (text.length > MAX_REVIEW_TEXT_LENGTH) {
      updateReviewEditorStatus(t("reviews.save.tooLongError", { max: MAX_REVIEW_TEXT_LENGTH }), true);
      return;
    }

    pendingReviewSave = true;
    container.querySelectorAll<HTMLButtonElement>("[data-review-publish], [data-review-cancel]").forEach((button) => {
      button.disabled = true;
    });
    updateReviewEditorStatus(t("reviews.save.saving"));

    const result = await upsertMyEntityReview(
      state.entityId,
      text,
      state.contentLocale
    );
    pendingReviewSave = false;

    if (!result.review) {
      updateReviewEditorStatus(result.errorMessage ?? t("reviews.save.error"), true);
      container.querySelectorAll<HTMLButtonElement>("[data-review-publish], [data-review-cancel]").forEach((button) => {
        button.disabled = false;
      });
      return;
    }

    const existingReviewIds = new Set(state.reviews.map((review) => review.id));
    const nextReviews = existingReviewIds.has(result.review.id)
      ? state.reviews.map((review) => (review.id === result.review!.id ? result.review! : review))
      : [result.review, ...state.reviews];

    onStateChange({
      ...state,
      hasCurrentUserReview: true,
      myReviewText: result.review.text,
      reviews: nextReviews,
      sort: "newest"
    });

    isWritingReview = false;
    draftReviewText = result.review.text;
    setActiveReviewIndex(0);
    if (cardHost) {
      resumeAutoDismiss(cardHost as AutoDismissHost);
    }
    rerenderList();
  }

  const bindReviewWriteControls = (root: ParentNode): void => {
    if (!(root instanceof HTMLElement) || root.dataset.reviewWriteControlsBound === "true") {
      return;
    }

    root.dataset.reviewWriteControlsBound = "true";

    root.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest("[data-review-write]")) {
        startWritingReview();
        return;
      }

      if (event.target.closest("[data-review-cancel]")) {
        cancelWritingReview();
        return;
      }

      if (event.target.closest("[data-review-publish]")) {
        void publishReview();
      }
    });
  };

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

  container.querySelector<HTMLButtonElement>("[data-show-all-reviews]")?.addEventListener("click", () => {
    void actions.onToggleShowAll?.();
  });

  container.querySelector<HTMLSelectElement>("[data-review-sort]")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;

    if (value !== "likes" && value !== "newest") {
      return;
    }

    onStateChange({
      ...getState(),
      sort: value
    });
    setActiveReviewIndex(0);
    rerenderList();
  });

  bindReviewVoteControls(container);
  bindReviewWriteControls(container);
  bindReviewCarouselNav(container, {
    getIndex: () => activeReviewIndex,
    getTotal: () => getLimitedReviews().length,
    onNavigate: (nextIndex) => {
      setActiveReviewIndex(nextIndex);
      rerenderList({ animateShell: false });
    }
  });
}

function getCardHost(container: ParentNode): HTMLElement | null {
  const root = container.getRootNode();

  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host;
  }

  return null;
}

function bindReviewEditorKeyboardGuard(target: HTMLElement | null): void {
  if (!target || target.dataset.reviewEditorKeyboardGuardBound === "true") {
    return;
  }

  target.dataset.reviewEditorKeyboardGuardBound = "true";

  const stopPageHotkeyPropagation = (event: Event): void => {
    event.stopPropagation();
  };

  target.addEventListener("keydown", stopPageHotkeyPropagation);
  target.addEventListener("keypress", stopPageHotkeyPropagation);
  target.addEventListener("keyup", stopPageHotkeyPropagation);
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}
