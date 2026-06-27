export function renderPopupRatePanel(options: {
  isAuthenticated: boolean;
  myRatingScore: number | null;
  rateScoreDataAttribute: string;
  showLabel?: boolean;
  statusSelector?: string;
}): string {
  const showLabel = options.showLabel !== false;
  const labelMarkup = showLabel ? `<p class="home-rate-label">Your rating</p>` : "";
  const summaryMarkup =
    options.myRatingScore === null
      ? `<p class="muted-copy">You have not rated this page yet.</p>`
      : `<p class="status-line success-line">Your rating: ${options.myRatingScore} / 5</p>`;

  const statusMarkup = options.statusSelector
    ? `<p class="rate-status" ${options.statusSelector} hidden></p>`
    : `<p class="rate-status" data-rate-status hidden></p>`;

  return `
    <section class="home-rate-panel">
      ${labelMarkup}
      ${summaryMarkup}
      <div class="reviewo-rate-controls popup-rate-controls" role="group" aria-label="Rate this page">
        ${[1, 2, 3, 4, 5]
          .map((score) => {
            const isSelected = options.myRatingScore === score;

            return `
              <button
                type="button"
                class="reviewo-rate-button${isSelected ? " is-selected" : ""}"
                ${options.rateScoreDataAttribute}="${score}"
                aria-pressed="${isSelected}"
                ${options.isAuthenticated ? "" : "disabled"}
              >
                ${score}
              </button>
            `;
          })
          .join("")}
      </div>
      <p class="muted-copy ${options.isAuthenticated ? "is-hidden" : ""}">Sign in to rate.</p>
      ${statusMarkup}
    </section>
  `;
}
