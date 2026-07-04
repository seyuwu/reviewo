import type { TranslateFn } from "@reviewo/i18n";

import { resumeAutoDismiss, suspendAutoDismiss, type AutoDismissHost } from "./auto-dismiss.js";

const RATING_CARD_HOST_ID = "reviewo-rating-card-host";

export function isRatingCardPinned(host: AutoDismissHost): boolean {
  return host.reviewoCardPinned === true;
}

export function setRatingCardPinned(host: AutoDismissHost, pinned: boolean): void {
  host.reviewoCardPinned = pinned;

  if (pinned) {
    suspendAutoDismiss(host);
    return;
  }

  resumeAutoDismiss(host);
}

export function isAnyRatingCardPinned(): boolean {
  const host = document.getElementById(RATING_CARD_HOST_ID) as AutoDismissHost | null;

  return host ? isRatingCardPinned(host) : false;
}

export function renderCardPinButtonMarkup(t: TranslateFn, isPinned: boolean): string {
  const ariaLabel = isPinned ? t("card.pin.unpinAriaLabel") : t("card.pin.pinAriaLabel");

  return `
    <button
      type="button"
      class="reviewo-pin${isPinned ? " is-pinned" : ""}"
      data-card-pin
      aria-pressed="${isPinned}"
      aria-label="${escapeHtmlAttribute(ariaLabel)}"
      title="${escapeHtmlAttribute(ariaLabel)}"
    >
      <svg
        class="reviewo-pin-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.83-2.83l8.49-8.48" />
      </svg>
    </button>
  `;
}

export function bindCardPinButton(
  container: ParentNode,
  host: AutoDismissHost,
  getIsPinned: () => boolean,
  setIsPinned: (pinned: boolean) => void,
  t: TranslateFn
): void {
  const button = container.querySelector<HTMLButtonElement>("[data-card-pin]");

  button?.addEventListener("click", () => {
    const nextPinned = !getIsPinned();

    setIsPinned(nextPinned);
    setRatingCardPinned(host, nextPinned);
    button.classList.toggle("is-pinned", nextPinned);
    button.setAttribute("aria-pressed", String(nextPinned));

    const ariaLabel = nextPinned ? t("card.pin.unpinAriaLabel") : t("card.pin.pinAriaLabel");
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
  });
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
