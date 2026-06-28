import { hideRatingCard } from "./rating-card.js";

const HOVER_LEAVE_AUTO_DISMISS_MS = 2000;

export type AutoDismissHost = HTMLElement & {
  reviewoAutoDismissPendingCleanup?: () => void;
  reviewoAutoDismissRoot?: HTMLElement;
  reviewoAutoDismissSeconds?: number;
  reviewoAutoDismissSuspended?: boolean;
  reviewoDismissTimer?: ReturnType<typeof setTimeout>;
  reviewoIsClosing?: boolean;
  reviewoOutsideDismissCleanup?: () => void;
};

function scheduleAutoDismiss(host: AutoDismissHost, delayMs: number): void {
  if (host.reviewoAutoDismissSuspended) {
    return;
  }

  clearAutoDismiss(host);
  host.reviewoDismissTimer = setTimeout(() => {
    if (document.getElementById(host.id) !== host) {
      return;
    }

    if (isAutoDismissRootActive(host)) {
      clearAutoDismiss(host);
      return;
    }

    hideRatingCard({ animated: true });
  }, delayMs);
}

function isAutoDismissRootActive(host: AutoDismissHost): boolean {
  const interactionRoot = host.reviewoAutoDismissRoot;

  if (!interactionRoot) {
    return false;
  }

  return interactionRoot.matches(":hover") || interactionRoot.contains(document.activeElement);
}

export function bindAutoDismiss(
  host: AutoDismissHost,
  interactionRoot: HTMLElement,
  autoDismissSeconds: number
): void {
  unbindAutoDismiss(host);
  clearAutoDismiss(host);

  if (autoDismissSeconds <= 0) {
    return;
  }

  host.reviewoAutoDismissRoot = interactionRoot;
  host.reviewoAutoDismissSeconds = autoDismissSeconds;
  host.reviewoAutoDismissSuspended = false;

  const pauseDismiss = (): void => {
    clearAutoDismiss(host);
  };

  const scheduleAfterPointerLeave = (): void => {
    if (host.reviewoAutoDismissSuspended) {
      return;
    }

    scheduleAutoDismiss(host, HOVER_LEAVE_AUTO_DISMISS_MS);
  };

  const handleFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;

    if (next instanceof Node && interactionRoot.contains(next)) {
      return;
    }

    scheduleAfterPointerLeave();
  };

  interactionRoot.addEventListener("pointerenter", pauseDismiss);
  interactionRoot.addEventListener("pointermove", pauseDismiss);
  interactionRoot.addEventListener("pointerdown", pauseDismiss);
  interactionRoot.addEventListener("click", pauseDismiss);
  interactionRoot.addEventListener("pointerleave", scheduleAfterPointerLeave);
  interactionRoot.addEventListener("focusin", pauseDismiss);
  interactionRoot.addEventListener("focusout", handleFocusOut);

  host.reviewoAutoDismissPendingCleanup = () => {
    interactionRoot.removeEventListener("pointerenter", pauseDismiss);
    interactionRoot.removeEventListener("pointermove", pauseDismiss);
    interactionRoot.removeEventListener("pointerdown", pauseDismiss);
    interactionRoot.removeEventListener("click", pauseDismiss);
    interactionRoot.removeEventListener("pointerleave", scheduleAfterPointerLeave);
    interactionRoot.removeEventListener("focusin", pauseDismiss);
    interactionRoot.removeEventListener("focusout", handleFocusOut);
  };

  scheduleAutoDismiss(host, autoDismissSeconds * 1000);
}

export function suspendAutoDismiss(host: AutoDismissHost): void {
  host.reviewoAutoDismissSuspended = true;
  clearAutoDismiss(host);
}

export function resumeAutoDismiss(host: AutoDismissHost): void {
  const interactionRoot = host.reviewoAutoDismissRoot;
  const autoDismissSeconds = host.reviewoAutoDismissSeconds ?? 0;

  if (!interactionRoot || autoDismissSeconds <= 0 || !host.reviewoAutoDismissPendingCleanup) {
    return;
  }

  host.reviewoAutoDismissSuspended = false;
  clearAutoDismiss(host);

  if (isAutoDismissRootActive(host)) {
    return;
  }

  scheduleAutoDismiss(host, autoDismissSeconds * 1000);
}

export function unbindAutoDismiss(host: AutoDismissHost): void {
  host.reviewoAutoDismissPendingCleanup?.();
  host.reviewoAutoDismissPendingCleanup = undefined;
  host.reviewoAutoDismissRoot = undefined;
  host.reviewoAutoDismissSeconds = undefined;
  host.reviewoAutoDismissSuspended = undefined;
}

export function clearAutoDismiss(host: AutoDismissHost): void {
  if (host.reviewoDismissTimer) {
    clearTimeout(host.reviewoDismissTimer);
    host.reviewoDismissTimer = undefined;
  }
}

export function bindOutsideDismiss(host: AutoDismissHost): void {
  unbindOutsideDismiss(host);

  let ignoreOutsidePointer = true;
  const enableOutsideDismiss = window.setTimeout(() => {
    ignoreOutsidePointer = false;
  }, 0);

  const handlePointerDown = (event: PointerEvent): void => {
    if (ignoreOutsidePointer || host.reviewoIsClosing) {
      return;
    }

    if (!document.contains(host)) {
      return;
    }

    if (event.composedPath().includes(host)) {
      return;
    }

    hideRatingCard({ animated: true });
  };

  document.addEventListener("pointerdown", handlePointerDown, true);

  host.reviewoOutsideDismissCleanup = () => {
    window.clearTimeout(enableOutsideDismiss);
    document.removeEventListener("pointerdown", handlePointerDown, true);
  };
}

export function unbindOutsideDismiss(host: AutoDismissHost): void {
  host.reviewoOutsideDismissCleanup?.();
  host.reviewoOutsideDismissCleanup = undefined;
}
