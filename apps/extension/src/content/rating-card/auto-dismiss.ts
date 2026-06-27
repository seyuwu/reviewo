import { hideRatingCard } from "./rating-card.js";

type DismissHost = HTMLElement & {
  reviewoDismissTimer?: ReturnType<typeof setTimeout>;
};

export function bindAutoDismiss(host: DismissHost, autoDismissSeconds: number): void {
  clearAutoDismiss(host);

  if (autoDismissSeconds <= 0) {
    return;
  }

  const scheduleDismiss = (): void => {
    clearAutoDismiss(host);
    host.reviewoDismissTimer = setTimeout(() => {
      hideRatingCard();
    }, autoDismissSeconds * 1000);
  };

  host.addEventListener("mouseenter", () => {
    clearAutoDismiss(host);
  });
  host.addEventListener("mouseleave", scheduleDismiss);
  host.addEventListener("focusin", () => {
    clearAutoDismiss(host);
  });
  host.addEventListener("focusout", scheduleDismiss);

  scheduleDismiss();
}

export function clearAutoDismiss(host: DismissHost): void {
  if (host.reviewoDismissTimer) {
    clearTimeout(host.reviewoDismissTimer);
    host.reviewoDismissTimer = undefined;
  }
}
