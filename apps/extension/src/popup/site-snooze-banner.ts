import {
  clearSiteSnooze,
  formatSiteSnoozeUntil,
  readSiteHostname,
  readSiteSnoozeExpiresAt
} from "../shared/site-snooze.js";
import type { ActiveTabResolveState } from "./services/active-tab-resolve.js";
import { requestShowRatingCardOnActiveTab } from "./services/request-show-rating-card.js";
import { escapeHtml } from "./view-helpers.js";

export async function syncSiteSnoozeBanner(
  container: HTMLElement,
  activeTab: ActiveTabResolveState,
  onChanged: () => void
): Promise<void> {
  const slot = ensureSiteSnoozeBannerSlot(container);

  if (!activeTab.url) {
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }

  const hostname = readSiteHostname(activeTab.url);
  const expiresAt = await readSiteSnoozeExpiresAt(hostname);

  if (!expiresAt) {
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }

  slot.hidden = false;
  slot.innerHTML = `
    <section class="site-snooze-banner">
      <div class="site-snooze-banner-copy">
        <p class="site-snooze-banner-title">Reviewo отключён на этом сайте</p>
        <p class="site-snooze-banner-meta">До ${escapeHtml(formatSiteSnoozeUntil(expiresAt))}</p>
      </div>
      <button type="button" class="primary-button site-snooze-enable-button" data-enable-site-snooze>
        Включить снова
      </button>
    </section>
  `;

  slot.querySelector<HTMLButtonElement>("[data-enable-site-snooze]")?.addEventListener(
    "click",
    () => {
      void (async () => {
        await clearSiteSnooze(hostname);
        await requestShowRatingCardOnActiveTab();
        onChanged();
      })();
    },
    { once: true }
  );
}

function ensureSiteSnoozeBannerSlot(container: HTMLElement): HTMLElement {
  const existingSlot = container.querySelector<HTMLElement>("[data-site-snooze-banner]");

  if (existingSlot) {
    return existingSlot;
  }

  const slot = document.createElement("section");
  slot.className = "site-snooze-banner-slot";
  slot.dataset.siteSnoozeBanner = "true";
  slot.hidden = true;
  container.prepend(slot);

  return slot;
}
