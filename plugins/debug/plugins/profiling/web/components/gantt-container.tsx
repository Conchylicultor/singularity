import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { MdClose } from "react-icons/md";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { useGanttZoom, type ZoomWindow } from "./use-gantt-zoom";
import { DragSelection, type DragState } from "./drag-selection";

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTickMs(ms: number): string {
  if (ms === 0) return "0";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function TimeAxis({
  title,
  totalMs,
  zoomWindow,
  onZoomReset,
}: {
  title: string;
  totalMs: number;
  zoomWindow?: ZoomWindow | null;
  onZoomReset?: () => void;
}): ReactElement {
  const tickCount = 6;
  const viewStart = zoomWindow?.startMs ?? 0;
  const viewEnd = zoomWindow?.endMs ?? totalMs;
  const viewRange = viewEnd - viewStart;

  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round(viewStart + (i / tickCount) * viewRange),
  );

  return (
    <div className="relative flex h-6 border-b px-4">
      <div className="flex w-40 shrink-0 items-center gap-1.5">
        <SectionLabel
          as="span"
          className="text-[10px] font-medium tracking-wider"
        >
          {title}
        </SectionLabel>
        {zoomWindow ? (
          <>
            <span className="text-[10px] font-medium tabular-nums text-info">
              {formatTickMs(zoomWindow.startMs)}–
              {formatTickMs(zoomWindow.endMs)}
            </span>
            <button
              className="flex items-center text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onZoomReset?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MdClose className="size-3" />
            </button>
          </>
        ) : (
          <span className="text-[10px] font-medium tabular-nums text-foreground">
            {formatDuration(totalMs)}
          </span>
        )}
      </div>
      <div className="relative flex-1">
        {ticks.map((ms) => (
          <div
            key={ms}
            className="absolute top-0 flex h-full flex-col items-center"
            style={{
              left:
                viewRange > 0
                  ? `${((ms - viewStart) / viewRange) * 100}%`
                  : "0%",
            }}
          >
            <div className="h-2 w-px bg-border" />
            <span className="text-[9px] tabular-nums text-muted-foreground">
              {formatTickMs(ms)}
            </span>
          </div>
        ))}
      </div>
      <div className="w-16 shrink-0" />
    </div>
  );
}

export interface GanttContainerContextValue {
  toLeftPct: (ms: number, totalMs: number) => string;
  toWidthPct: (durationMs: number, totalMs: number) => string;
  totalMs: number;
}

const GanttContainerContext =
  createContext<GanttContainerContextValue | null>(null);

export function useGanttContainerContext(): GanttContainerContextValue {
  const ctx = useContext(GanttContainerContext);
  if (!ctx)
    throw new Error("useGanttContainerContext requires GanttContainer");
  return ctx;
}

const LABEL_WIDTH = 160;
const DURATION_WIDTH = 64;
const MIN_DRAG_PX = 4;

function useGanttDrag(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onZoom: (startFraction: number, endFraction: number) => void,
): {
  drag: DragState | null;
  handlePointerDown: (e: PointerEvent) => void;
} {
  const [drag, setDrag] = useState<DragState | null>(null);

  function getBarBounds(): { left: number; width: number } | null {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const left = rect.left + LABEL_WIDTH;
    const width = rect.width - LABEL_WIDTH - DURATION_WIDTH;
    return width > 0 ? { left, width } : null;
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const bounds = getBarBounds();
    if (!bounds) return;
    if (e.clientX < bounds.left || e.clientX > bounds.left + bounds.width)
      return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const start = (e.clientX - bounds.left) / bounds.width;
    setDrag({ start, current: start });

    const target = e.currentTarget as HTMLElement;
    const onMove = (me: Event): void => {
      const pe = me as globalThis.PointerEvent;
      const frac = Math.max(
        0,
        Math.min(1, (pe.clientX - bounds.left) / bounds.width),
      );
      setDrag((prev) => (prev ? { ...prev, current: frac } : null));
    };
    const onUp = (ue: Event): void => {
      target.releasePointerCapture((ue as globalThis.PointerEvent).pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      setDrag((prev) => {
        if (!prev) return null;
        const pxDelta = Math.abs(prev.current - prev.start) * bounds.width;
        if (pxDelta >= MIN_DRAG_PX) {
          onZoom(prev.start, prev.current);
        }
        return null;
      });
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  return { drag, handlePointerDown };
}

export function GanttContainer({
  title,
  totalMs,
  children,
}: {
  title: string;
  totalMs: number;
  children: ReactNode;
}): ReactElement {
  const zoom = useGanttZoom();
  const containerRef = useRef<HTMLDivElement>(null);
  const { drag, handlePointerDown } = useGanttDrag(
    containerRef,
    (s, e) => zoom.zoomTo(s, e, totalMs),
  );

  const ctx = useMemo(
    () => ({
      toLeftPct: zoom.toLeftPct,
      toWidthPct: zoom.toWidthPct,
      totalMs,
    }),
    [zoom.toLeftPct, zoom.toWidthPct, totalMs],
  );

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      onPointerDown={handlePointerDown}
      onDoubleClick={zoom.isZoomed ? zoom.reset : undefined}
    >
      <TimeAxis
        title={title}
        totalMs={totalMs}
        zoomWindow={zoom.zoomWindow}
        onZoomReset={zoom.reset}
      />
      <GanttContainerContext.Provider value={ctx}>
        {children}
      </GanttContainerContext.Provider>
      <DragSelection drag={drag} />
    </div>
  );
}
