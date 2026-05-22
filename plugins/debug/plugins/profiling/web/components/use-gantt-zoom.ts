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
  toLeftPct: (ms: number, totalMs: number) => string;
  toWidthPct: (durationMs: number, totalMs: number) => string;
}

const MIN_ZOOM_MS = 50;

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

  const toLeftPct = useCallback(
    (ms: number, totalMs: number): string => {
      if (zoomWindow) {
        const range = zoomWindow.endMs - zoomWindow.startMs;
        if (range <= 0) return "0%";
        return `${((ms - zoomWindow.startMs) / range) * 100}%`;
      }
      if (totalMs <= 0) return "0%";
      return `${(ms / totalMs) * 100}%`;
    },
    [zoomWindow],
  );

  const toWidthPct = useCallback(
    (durationMs: number, totalMs: number): string => {
      const range = zoomWindow ? zoomWindow.endMs - zoomWindow.startMs : totalMs;
      if (range <= 0) return "0%";
      return `${Math.max((durationMs / range) * 100, 0.3)}%`;
    },
    [zoomWindow],
  );

  return {
    zoomWindow,
    isZoomed: zoomWindow !== null,
    zoomTo,
    reset,
    toLeftPct,
    toWidthPct,
  };
}
