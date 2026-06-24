import { useResizeObserver } from "@plugins/primitives/plugins/element-size/web";
import { useCallback, useState } from "react";

/**
 * Measure the live column count of a responsive `auto-fill` card grid.
 *
 * Lane-aware (columns-per-row) virtualization needs to know how many columns the
 * browser packs into the available width — the figure CSS derives from the
 * content width, the column gap, and the `minmax(minCardWidth, 1fr)` track, and
 * which is not otherwise exposed to JS. We attach a zero-height **probe** grid
 * (same gap as the real grid) and apply the exact CSS `auto-fill` track formula
 * to its measured content width and resolved gap:
 *
 *   columns = floor((width + gap) / (minCardWidth + gap))     (clamped ≥ 1)
 *
 * Reading the gap off the probe (rather than hard-coding the `lg` token in px)
 * keeps the count correct across token/density changes for free.
 *
 * Returns a callback ref to spread onto the probe element plus the live column
 * count (`0` until first measured — callers gate their windowed render on it).
 * A `ResizeObserver` re-measures on every width change.
 */
export function useGridColumns(minCardWidthPx: number): {
  probeRef: (el: HTMLElement | null) => void;
  columns: number;
} {
  const [columns, setColumns] = useState(0);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const probeRef = useCallback((node: HTMLElement | null) => setEl(node), []);

  useResizeObserver(
    () => el,
    () => {
      if (!el) return;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      // The probe carries no padding, so clientWidth is the content width the
      // cards get. Mirrors the browser's own `auto-fill` track count.
      const width = el.clientWidth;
      const count = Math.floor((width + gap) / (minCardWidthPx + gap));
      setColumns(Math.max(1, count));
    },
    { deps: [el, minCardWidthPx] },
  );

  return { probeRef, columns };
}
