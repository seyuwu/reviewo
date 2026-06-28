import type { TranslateFn } from "@reviewo/i18n";

export function clampReviewCarouselIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, total - 1));
}

export function findReviewCarouselIndexById<T extends { id: string }>(
  reviews: T[],
  reviewId: string,
  fallbackIndex = 0
): number {
  const index = reviews.findIndex((review) => review.id === reviewId);

  if (index < 0) {
    return clampReviewCarouselIndex(fallbackIndex, reviews.length);
  }

  return index;
}

export function formatReviewCarouselPosition(
  t: TranslateFn,
  current: number,
  total: number
): string {
  const translated = t("reviews.carousel.position", { current, total });

  if (translated === "reviews.carousel.position" || translated.includes("{current}")) {
    return `${current} / ${total}`;
  }

  return translated;
}

export interface ReviewCarouselNavOptions {
  classPrefix: string;
  escapeHtml: (value: string) => string;
}

export function renderReviewCarouselNavMarkup(
  t: TranslateFn,
  currentIndex: number,
  total: number,
  options: ReviewCarouselNavOptions
): string {
  if (total <= 1) {
    return "";
  }

  const { classPrefix, escapeHtml } = options;
  const current = currentIndex + 1;
  const prevDisabled = currentIndex <= 0;
  const nextDisabled = currentIndex >= total - 1;

  return `
    <div class="${classPrefix}-carousel-nav" data-review-carousel-nav>
      <button
        type="button"
        class="${classPrefix}-carousel-button"
        data-review-prev
        aria-label="${escapeHtml(t("reviews.carousel.prev"))}"
        ${prevDisabled ? "disabled" : ""}
      >
        ←
      </button>
      <span
        class="${classPrefix}-carousel-counter"
        data-review-counter
        aria-live="polite"
      >${escapeHtml(formatReviewCarouselPosition(t, current, total))}</span>
      <button
        type="button"
        class="${classPrefix}-carousel-button"
        data-review-next
        aria-label="${escapeHtml(t("reviews.carousel.next"))}"
        ${nextDisabled ? "disabled" : ""}
      >
        →
      </button>
    </div>
  `;
}

export interface ReviewCarouselBinding {
  getIndex: () => number;
  getTotal: () => number;
  onNavigate: (nextIndex: number) => void;
}

type ReviewCarouselHost = HTMLElement & {
  __reviewCarouselBinding?: ReviewCarouselBinding;
};

export function bindReviewCarouselNav(
  container: ParentNode,
  binding: ReviewCarouselBinding
): void {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const host = container as ReviewCarouselHost;
  host.__reviewCarouselBinding = binding;

  if (host.dataset.reviewCarouselNavBound === "true") {
    return;
  }

  host.dataset.reviewCarouselNavBound = "true";

  host.addEventListener("click", (event) => {
    const currentBinding = host.__reviewCarouselBinding;

    if (!currentBinding || !(event.target instanceof Element)) {
      return;
    }

    if (!event.target.closest("[data-review-carousel]")) {
      return;
    }

    const total = currentBinding.getTotal();

    if (total <= 1) {
      return;
    }

    if (event.target.closest("[data-review-prev]")) {
      currentBinding.onNavigate(clampReviewCarouselIndex(currentBinding.getIndex() - 1, total));
      return;
    }

    if (event.target.closest("[data-review-next]")) {
      currentBinding.onNavigate(clampReviewCarouselIndex(currentBinding.getIndex() + 1, total));
    }
  });
}

export function updateReviewCarouselNav(
  container: ParentNode,
  t: TranslateFn,
  currentIndex: number,
  total: number
): void {
  const prevButton = container.querySelector<HTMLButtonElement>("[data-review-prev]");
  const nextButton = container.querySelector<HTMLButtonElement>("[data-review-next]");
  const counter = container.querySelector<HTMLElement>("[data-review-counter]");

  if (prevButton) {
    prevButton.disabled = currentIndex <= 0;
  }

  if (nextButton) {
    nextButton.disabled = currentIndex >= total - 1;
  }

  if (counter) {
    counter.textContent = formatReviewCarouselPosition(t, currentIndex + 1, total);
  }
}
