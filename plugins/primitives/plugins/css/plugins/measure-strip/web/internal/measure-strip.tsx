import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";

export interface MeasureStripProps {
  /** Consumer/hook OWNS the ref (the strip never creates it). */
  ref?: Ref<HTMLDivElement>;
  /** Gap between items, in px. */
  gap: number;
  /** Gates the portal; pass e.g. `count > 0`. Default true. */
  enabled?: boolean;
  /** Rendered as-is — NO implicit wrapping. */
  children: ReactNode;
}

/**
 * Off-screen, body-portaled, hidden flex row used to measure children's natural
 * widths before an overflow/collapse decision. Parked at -9999/-9999 with
 * opacity 0 + pointer-events none; portaled to document.body so it never affects
 * layout. The consumer owns the ref and reads `ref.current.children` widths.
 */
export function MeasureStrip({ ref, gap, enabled = true, children }: MeasureStripProps) {
  if (!enabled) return null;
  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      style={{ position: "fixed", top: -9999, left: -9999, display: "flex", gap, opacity: 0, pointerEvents: "none" }}
    >
      {children}
    </div>,
    document.body,
  );
}
