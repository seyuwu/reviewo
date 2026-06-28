import type { TranslateFn } from "@reviewo/i18n";

import { escapeHtml } from "../view-helpers.js";
import { fetchActiveNow, type ActiveNowItem } from "../services/entity-chat-api.js";

export function renderActiveNowHostMarkup(): string {
  return `<section class="active-now-panel card-section" data-active-now-host hidden></section>`;
}

export async function mountActiveNowPanel(
  host: HTMLElement | null,
  t: TranslateFn,
  onOpenEntity?: (item: ActiveNowItem) => void
): Promise<void> {
  if (!host) {
    return;
  }

  host.hidden = false;
  host.innerHTML = `<p class="muted-copy">${escapeHtml(t("chat.loading"))}</p>`;

  try {
    const activeNow = await fetchActiveNow(5);

    if (activeNow.items.length === 0) {
      host.innerHTML = `
        <h2>${escapeHtml(t("chat.activeNow.title"))}</h2>
        <p class="muted-copy">${escapeHtml(t("chat.activeNow.empty"))}</p>
      `;
      return;
    }

    host.innerHTML = `
      <h2>${escapeHtml(t("chat.activeNow.title"))}</h2>
      <ul class="active-now-list">
        ${activeNow.items
          .map(
            (item) => `
          <li>
            <button type="button" class="active-now-item" data-active-entity-id="${escapeHtml(item.entityId)}">
              <strong>${escapeHtml(item.previewMessage ?? item.entityTitle)}</strong>
              <span class="muted-copy">${escapeHtml(item.entityTitle)} · ${escapeHtml(
                t("chat.activeNow.online", { count: String(item.onlineCount) })
              )}</span>
            </button>
          </li>
        `
          )
          .join("")}
      </ul>
    `;

    host.querySelectorAll<HTMLButtonElement>("[data-active-entity-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = activeNow.items.find((entry) => entry.entityId === button.dataset.activeEntityId);

        if (item) {
          onOpenEntity?.(item);
        }
      });
    });
  } catch {
    host.hidden = true;
  }
}
