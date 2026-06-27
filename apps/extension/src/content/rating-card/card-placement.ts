import type { CardPlacement } from "../../shared/preferences.js";

export function applyCardPlacement(host: HTMLElement, placement: CardPlacement): void {
  host.dataset.placement = placement;
}
