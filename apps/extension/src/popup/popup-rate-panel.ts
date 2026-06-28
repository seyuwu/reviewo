import type { TranslateFn } from "@reviewo/i18n";

export function renderPopupRatePanel(
  t: TranslateFn,
  options: {
    isAuthenticated: boolean;
    myRatingScore: number | null;
    rateScoreDataAttribute: string;
    showLabel?: boolean;
    statusSelector?: string;
  }
): string {
  const showLabel = options.showLabel !== false;
  const labelMarkup = showLabel ? `<p class="home-rate-label">${escapeHtml(t("rating.yourRating"))}</p>` : "";
  const summaryMarkup =
    options.myRatingScore === null
      ? `<p class="muted-copy">${escapeHtml(t("rating.notRatedYet"))}</p>`
      : `<p class="status-line success-line">${escapeHtml(t("rating.yourRatingValue", { score: options.myRatingScore }))}</p>`;

  const statusMarkup = options.statusSelector
    ? `<p class="rate-status" ${options.statusSelector} hidden></p>`
    : `<p class="rate-status" data-rate-status hidden></p>`;

  return `
    <section class="home-rate-panel">
      ${labelMarkup}
      ${summaryMarkup}
      <div class="reviewo-rate-controls popup-rate-controls" role="group" aria-label="${escapeHtml(t("rating.groupAriaLabelPage"))}">
        ${[1, 2, 3, 4, 5]
          .map((score) => {
            const isSelected = options.myRatingScore === score;

            return `
      <button
                type="button"
                class="reviewo-rate-button${isSelected ? " is-selected" : ""}"
                ${options.rateScoreDataAttribute}="${score}"
                aria-pressed="${isSelected}"
              >
                ${score}
              </button>
            `;
          })
          .join("")}
      </div>
      <button type="button" class="text-link sign-in-cta${options.isAuthenticated ? " is-hidden" : ""}" data-open-auth-prompt>
        ${escapeHtml(t("rating.signInToRate"))}
      </button>
      ${statusMarkup}
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
