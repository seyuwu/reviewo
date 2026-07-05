import type { CSSProperties } from "react";

export interface PopoverAnchor {
  x: number;
  y: number;
}

interface PopoverStyleOptions {
  estimatedHeight?: number;
  width?: number;
}

export function capturePopoverAnchor(event: Pick<MouseEvent, "clientX" | "clientY">): PopoverAnchor {
  return {
    x: event.clientX,
    y: event.clientY
  };
}

export function getPopoverStyleFromPoint(
  point: PopoverAnchor,
  options: PopoverStyleOptions = {}
): CSSProperties {
  const width = options.width ?? 320;
  const estimatedHeight = options.estimatedHeight ?? 420;
  const gap = 12;
  const viewportPadding = 12;

  let left = point.x - width / 2;
  let top = point.y + gap;

  if (top + estimatedHeight > window.innerHeight - viewportPadding) {
    top = point.y - estimatedHeight - gap;
  }

  top = Math.max(viewportPadding, top);
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));

  return {
    left,
    position: "fixed",
    top,
    width
  };
}

export function serializePopoverAnchor(anchor: PopoverAnchor): PopoverAnchor {
  return { x: anchor.x, y: anchor.y };
}
