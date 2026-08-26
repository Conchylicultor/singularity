import { pct } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { useCallback, useState } from "react";

export interface ZoomWindow {
  startMs: number;
  endMs: number;
}

export interface UseGanttZoom {
  zoomWindow: ZoomWindow | null;
  isZoomed: boolean;
  zoomTo: (startFraction: number, endFraction: number, totalMs: number) => void;
  reset: () => void;
  /** Where `ms` sits along the visible window, as a [0,1] fraction. */
  toLeftFraction: (ms: number, totalMs: number) => number;
  /** How much of the visible window `durationMs` covers, as a [0,1] fraction. */
  toWidthFraction: (durationMs: number, totalMs: number) => number;
}

const MIN_ZOOM_MS = 50;

/**
 * The smallest fraction of the track a bar is ever painted at, so a sub-pixel
 * span is still visible as a mark.
 *
 * It is a FLOOR applied as `min-width`, not a clamp applied to the width: the
 * bar's true extent stays declared and CSS resolves `max(width, min-width)`.
 * (This replaced a `Math.max` inside the width formatter, which overwrote the
 * number it was flooring — so a zoomed-in view could not tell a genuinely tiny
 * bar from one that had been rounded up.)
 */
export const MIN_BAR_FRACTION = 0.003;

/**
 * The `minSize` a bar of `durationMs` should carry — the floor for a real span,
 * and NOTHING for a zero-length one.
 *
 * The guard is the whole function. The old `Math.max` floored every width
 * including zero, so an empty Gantt painted a sliver on every row; consumers
 * worked around it by filtering their zero-length segments out one by one. A
 * floor that declines to floor an empty span removes the need to remember.
 */
export function minBarSize(durationMs: number): string | undefined {
  return durationMs > 0 ? pct(MIN_BAR_FRACTION) : undefined;
}

export function useGanttZoom(): UseGanttZoom {
  const [zoomWindow, setZoomWindow] = useState<ZoomWindow | null>(null);

  const zoomTo = useCallback(
    (startFraction: number, endFraction: number, totalMs: number) => {
      const lo = Math.min(startFraction, endFraction);
      const hi = Math.max(startFraction, endFraction);

      const viewStart = zoomWindow?.startMs ?? 0;
      const viewEnd = zoomWindow?.endMs ?? totalMs;
      const viewRange = viewEnd - viewStart;

      const absStart = viewStart + lo * viewRange;
      const absEnd = viewStart + hi * viewRange;

      if (absEnd - absStart < MIN_ZOOM_MS) return;
      setZoomWindow({ startMs: absStart, endMs: absEnd });
    },
    [zoomWindow],
  );

  const reset = useCallback(() => setZoomWindow(null), []);

  // Both accessors return NUMBERS, not `%` strings. The formatting belongs to
  // whoever writes the style (`pct()`), and a string forced every consumer that
  // wanted the number back — `gantt-rows.tsx` was formatting and immediately
  // `parseFloat`-ing the same value, and `gantt-container.tsx` re-derived the
  // math by hand rather than reuse it.
  const toLeftFraction = useCallback(
    (ms: number, totalMs: number): number => {
      if (zoomWindow) {
        const range = zoomWindow.endMs - zoomWindow.startMs;
        if (range <= 0) return 0;
        return (ms - zoomWindow.startMs) / range;
      }
      if (totalMs <= 0) return 0;
      return ms / totalMs;
    },
    [zoomWindow],
  );

  const toWidthFraction = useCallback(
    (durationMs: number, totalMs: number): number => {
      const range = zoomWindow
        ? zoomWindow.endMs - zoomWindow.startMs
        : totalMs;
      if (range <= 0) return 0;
      return durationMs / range;
    },
    [zoomWindow],
  );

  return {
    zoomWindow,
    isZoomed: zoomWindow !== null,
    zoomTo,
    reset,
    toLeftFraction,
    toWidthFraction,
  };
}
