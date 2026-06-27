import {
  readSiteHostname,
  SITE_SNOOZE_DURATIONS,
  snoozeSite,
  type SiteSnoozeDuration
} from "../../shared/site-snooze.js";

export function renderSiteSnoozePanelMarkup(): string {
  const optionsMarkup = SITE_SNOOZE_DURATIONS.map(
    (duration) => `
      <button
        type="button"
        class="reviewo-site-snooze-button"
        data-site-snooze="${duration}"
        title="Скрыть Reviewo на этом сайте на ${duration}"
      >
        ${duration}
      </button>
    `
  ).join("");

  return `
    <div class="reviewo-site-snooze">
      <span class="reviewo-site-snooze-label">Отключить на этом сайте</span>
      <div class="reviewo-site-snooze-options" role="group" aria-label="Срок отключения Reviewo на сайте">
        ${optionsMarkup}
      </div>
    </div>
  `;
}

export function bindSiteSnoozePanel(
  container: ParentNode,
  pageUrl: string,
  onSnoozed: () => void
): void {
  const hostname = readSiteHostname(pageUrl);

  container.querySelectorAll<HTMLButtonElement>("[data-site-snooze]").forEach((button) => {
    button.addEventListener("click", () => {
      const duration = button.dataset.siteSnooze;

      if (!isSiteSnoozeDuration(duration)) {
        return;
      }

      button.disabled = true;
      void snoozeSite(hostname, duration).then(() => {
        onSnoozed();
      });
    });
  });
}

function isSiteSnoozeDuration(value: string | undefined): value is SiteSnoozeDuration {
  return value === "24h" || value === "7d" || value === "30d" || value === "1y";
}
