import { extensionConfig } from "../../shared/config.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import { buildRatingCardSummary } from "./format-display.js";
import { RATING_CARD_STYLES } from "./rating-card-styles.js";

const RATING_CARD_HOST_ID = "reviewo-rating-card-host";
const RATING_CARD_ROOT_CLASS = "reviewo-rating-card-root";

export function hideRatingCard(): void {
  document.getElementById(RATING_CARD_HOST_ID)?.remove();
}

export function showRatingCardForFoundEntity(response: ExtensionResolveFoundResponse): void {
  hideRatingCard();

  const host = document.createElement("div");
  host.id = RATING_CARD_HOST_ID;
  host.className = RATING_CARD_ROOT_CLASS;

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleElement = document.createElement("style");
  styleElement.textContent = RATING_CARD_STYLES;

  const cardElement = document.createElement("article");
  cardElement.className = "reviewo-card";
  cardElement.setAttribute("role", "complementary");
  cardElement.setAttribute("aria-label", "Reviewo rating summary");

  const { averageScoreLabel, entityTitle, metaLabel } = buildRatingCardSummary(response);
  const entityPageUrl = buildEntityPageUrl(response.web.entityPagePath);

  cardElement.innerHTML = `
    <header class="reviewo-card-header">
      <span class="reviewo-eyebrow">Reviewo</span>
      <button type="button" class="reviewo-dismiss" aria-label="Dismiss Reviewo card">&times;</button>
    </header>
    <h2 class="reviewo-title" title="${escapeHtmlAttribute(entityTitle)}">${escapeHtmlText(entityTitle)}</h2>
    <div class="reviewo-stats">
      <div class="reviewo-rating-row">
        <span class="reviewo-rating-value">${escapeHtmlText(averageScoreLabel)}</span>
        <span class="reviewo-rating-scale">/ 5</span>
      </div>
      <p class="reviewo-meta">${escapeHtmlText(metaLabel)}</p>
    </div>
    <a class="reviewo-details" href="${escapeHtmlAttribute(entityPageUrl)}" target="_blank" rel="noopener noreferrer">
      More details
    </a>
  `;

  cardElement.querySelector(".reviewo-dismiss")?.addEventListener("click", () => {
    hideRatingCard();
  });

  applyHostPosition(host);
  shadowRoot.append(styleElement, cardElement);
  document.documentElement.append(host);
}

function applyHostPosition(host: HTMLElement): void {
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.right = "1rem";
  host.style.bottom = "1rem";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "auto";
}

function buildEntityPageUrl(entityPagePath: string): string {
  return new URL(entityPagePath, extensionConfig.webBaseUrl).toString();
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}
