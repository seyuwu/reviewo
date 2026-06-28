const CARD_HEIGHT_TRANSITION = "height 320ms cubic-bezier(0.22, 1, 0.36, 1)";

export function animateRatingCardShellHeight(shell: HTMLElement | null | undefined): void {
  if (!shell || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const card = shell.querySelector<HTMLElement>(".reviewo-card");

  if (!card) {
    return;
  }

  const startHeight = card.getBoundingClientRect().height;
  card.style.height = `${startHeight}px`;
  card.style.overflow = "hidden";

  requestAnimationFrame(() => {
    card.style.transition = CARD_HEIGHT_TRANSITION;
    card.style.height = "auto";
    void card.offsetHeight;
    const endHeight = card.getBoundingClientRect().height;

    if (Math.abs(endHeight - startHeight) < 1) {
      card.style.height = "";
      card.style.transition = "";
      card.style.overflow = "";
      return;
    }

    card.style.height = `${startHeight}px`;

    requestAnimationFrame(() => {
      card.style.height = `${endHeight}px`;
    });

    const cleanup = (event: TransitionEvent): void => {
      if (event.propertyName !== "height") {
        return;
      }

      card.style.height = "";
      card.style.transition = "";
      card.style.overflow = "";
      card.removeEventListener("transitionend", cleanup);
    };

    card.addEventListener("transitionend", cleanup);
  });
}
