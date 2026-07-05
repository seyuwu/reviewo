const HIGHLIGHT_CLASS = "entitySectionHighlight";
const HIGHLIGHT_DURATION_MS = 1000;
const HIGHLIGHT_SETTLE_DELAY_MS = 150;
const SCROLL_END_TIMEOUT_MS = 900;

let highlightGeneration = 0;

function getHighlightTarget(element: HTMLElement): HTMLElement {
  const panel = element.querySelector(":scope > .panel-card");

  if (panel instanceof HTMLElement) {
    return panel;
  }

  return element;
}

function flashSectionHighlight(element: HTMLElement): void {
  const target = getHighlightTarget(element);

  target.classList.remove(HIGHLIGHT_CLASS);
  // Force reflow so repeated clicks retrigger the animation.
  void target.offsetWidth;
  target.classList.add(HIGHLIGHT_CLASS);

  window.setTimeout(() => {
    target.classList.remove(HIGHLIGHT_CLASS);
  }, HIGHLIGHT_DURATION_MS);
}

function isSectionVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const visibleTop = Math.max(rect.top, 0);
  const visibleBottom = Math.min(rect.bottom, viewportHeight);
  const visibleHeight = visibleBottom - visibleTop;

  if (visibleHeight <= 0) {
    return false;
  }

  const visibilityThreshold = Math.min(Math.max(element.offsetHeight * 0.35, 80), 160);

  return visibleHeight >= visibilityThreshold;
}

function waitForScrollEnd(timeoutMs = SCROLL_END_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("scrollend", onScrollEnd);
      window.clearTimeout(fallbackTimer);
      resolve();
    };

    const onScrollEnd = () => {
      finish();
    };

    const fallbackTimer = window.setTimeout(finish, timeoutMs);

    if ("onscrollend" in window) {
      window.addEventListener("scrollend", onScrollEnd, { once: true });
      return;
    }

    let lastScrollY = window.scrollY;
    let stableFrames = 0;

    const poll = () => {
      if (settled) {
        return;
      }

      if (window.scrollY === lastScrollY) {
        stableFrames += 1;

        if (stableFrames >= 4) {
          finish();
          return;
        }
      } else {
        stableFrames = 0;
        lastScrollY = window.scrollY;
      }

      window.requestAnimationFrame(poll);
    };

    window.requestAnimationFrame(poll);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function navigateToEntitySection(sectionId: string): void {
  const generation = ++highlightGeneration;

  void navigateToEntitySectionAsync(sectionId, generation);
}

async function navigateToEntitySectionAsync(sectionId: string, generation: number): Promise<void> {
  const element = document.getElementById(sectionId);

  if (!element) {
    return;
  }

  const needsScroll = !isSectionVisible(element);

  if (needsScroll) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    await waitForScrollEnd();
    await delay(HIGHLIGHT_SETTLE_DELAY_MS);
  } else {
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (generation !== highlightGeneration) {
    return;
  }

  flashSectionHighlight(element);
}
