import type { MessageKey, TranslateFn } from "@reviewo/i18n";

import {
  readSiteHostname,
  SITE_SNOOZE_DURATIONS,
  snoozeSite,
  type SiteSnoozeDuration
} from "../../shared/site-snooze.js";

const SNOOZE_DURATION_MESSAGE_KEYS: Record<SiteSnoozeDuration, MessageKey> = {
  "24h": "snooze.duration.24h",
  "7d": "snooze.duration.7d",
  "30d": "snooze.duration.30d",
  "1y": "snooze.duration.1y"
};

export function renderSiteSnoozePanelMarkup(t: TranslateFn): string {
  const optionsMarkup = SITE_SNOOZE_DURATIONS.map((duration) => {
    const durationLabel = t(SNOOZE_DURATION_MESSAGE_KEYS[duration]);

    return `
      <button
        type="button"
        class="reviewo-site-snooze-button"
        data-site-snooze="${duration}"
        title="${escapeHtmlAttribute(t("snooze.panel.durationTooltip", { duration: durationLabel }))}"
      >
        ${escapeHtmlText(durationLabel)}
      </button>
    `;
  }).join("");

  return `
    <div class="reviewo-site-snooze">
      <span class="reviewo-site-snooze-label">${escapeHtmlText(t("snooze.panel.label"))}</span>
      <div class="reviewo-site-snooze-options" role="group" aria-label="${escapeHtmlAttribute(t("snooze.panel.durationAriaLabel"))}">
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

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}
