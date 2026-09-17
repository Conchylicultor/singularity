import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { useCallback, useState } from "react";

/**
 * Measure how many fixed-width tracks an `auto-fill` icons grid packs into its
 * width — the lane count the windowed path chunks tiles by.
 *
 * The probe is a zero-height `Grid cellWidth` with the real grid's classes, so
 * the browser resolves the same tracks (container-query cell width and column
 * gap included); counting the resolved `grid-template-columns` tracks reads the
 * browser's answer instead of re-deriving it from token values.
 *
 * Returns a callback ref for the probe and the live column count (`0` until
 * first measured — callers gate their windowed render on it).
 */
export function useIconColumns(): {
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
      const tracks = getComputedStyle(el)
        .gridTemplateColumns.split(" ")
        .filter((t) => t.length > 0).length;
      setColumns(Math.max(1, tracks));
    },
    { deps: [el] },
  );

  return { probeRef, columns };
}
