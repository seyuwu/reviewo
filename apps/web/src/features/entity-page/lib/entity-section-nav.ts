const HIGHLIGHT_CLASS = "entitySectionHighlight";
const HIGHLIGHT_DURATION_MS = 1000;

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

export function navigateToEntitySection(sectionId: string): void {
  const element = document.getElementById(sectionId);

  if (!element) {
    return;
  }

  element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  flashSectionHighlight(element);
}
