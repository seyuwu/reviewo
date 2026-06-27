import { hideRatingCard } from "./rating-card.js";

const HOVER_LEAVE_AUTO_DISMISS_MS = 2000;

type DismissHost = HTMLElement & {
  reviewoDismissTimer?: ReturnType<typeof setTimeout>;
};

export function bindAutoDismiss(host: DismissHost, autoDismissSeconds: number): void {
  clearAutoDismiss(host);

  if (autoDismissSeconds <= 0) {
    return;
  }

  const scheduleDismiss = (delayMs: number): void => {
    clearAutoDismiss(host);
    host.reviewoDismissTimer = setTimeout(() => {
      if (document.getElementById(host.id) !== host) {
        return;
      }

      hideRatingCard({ animated: true });
    }, delayMs);
  };

  const pauseDismiss = (): void => {
    clearAutoDismiss(host);
  };

  const scheduleAfterPointerLeave = (): void => {
    scheduleDismiss(HOVER_LEAVE_AUTO_DISMISS_MS);
  };

  host.addEventListener("mouseenter", pauseDismiss);
  host.addEventListener("mouseleave", scheduleAfterPointerLeave);
  host.addEventListener("focusin", pauseDismiss);
  host.addEventListener("focusout", scheduleAfterPointerLeave);

  scheduleDismiss(autoDismissSeconds * 1000);
}

export function clearAutoDismiss(host: DismissHost): void {
  if (host.reviewoDismissTimer) {
    clearTimeout(host.reviewoDismissTimer);
    host.reviewoDismissTimer = undefined;
  }
}
