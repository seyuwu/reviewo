export const CARD_REFERENCE_VIEWPORT = { width: 1920, height: 1080 } as const;
export const CARD_BASE_WIDTH_PX = 380;

export function computeCardUiScale(
  viewportWidth: number,
  viewportHeight: number
): number {
  const rawScale = Math.min(
    viewportWidth / CARD_REFERENCE_VIEWPORT.width,
    viewportHeight / CARD_REFERENCE_VIEWPORT.height
  );

  return Math.round(rawScale * 100) / 100;
}

export function installCardResponsiveScale(host: HTMLElement): () => void {
  const apply = () => {
    host.style.setProperty(
      "--reviewo-ui-scale",
      String(computeCardUiScale(window.innerWidth, window.innerHeight))
    );
  };

  apply();
  window.addEventListener("resize", apply);

  return () => {
    window.removeEventListener("resize", apply);
    host.style.removeProperty("--reviewo-ui-scale");
  };
}
