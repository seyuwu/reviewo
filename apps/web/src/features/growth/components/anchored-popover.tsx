"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  getPopoverStyleFromPoint,
  type PopoverAnchor
} from "../lib/anchored-popover-style";

interface AnchoredPopoverProps {
  anchor: PopoverAnchor;
  ariaLabelledBy?: string;
  children: ReactNode;
  className?: string;
  estimatedHeight?: number;
  onClose: () => void;
  width?: number;
}

export function AnchoredPopover({
  anchor,
  ariaLabelledBy,
  children,
  className = "growth-modal",
  estimatedHeight = 420,
  onClose,
  width = 320
}: AnchoredPopoverProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div className="growth-popover-backdrop" role="presentation" onClick={onClose} />
      <div
        className={`growth-popover ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        style={getPopoverStyleFromPoint(anchor, { estimatedHeight, width })}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
