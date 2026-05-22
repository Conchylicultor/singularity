import {
  createContext,
  useContext,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";
import { MdClose } from "react-icons/md";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { cn } from "@/lib/utils";
import { useGanttZoom, type ZoomWindow } from "./use-gantt-zoom";
import { DragSelection, type DragState } from "./drag-selection";

export interface Span {
  id: string;
  phase: string;
  plugin?: string;
  label: string;
  startMs: number;
  durationMs: number;
}

export interface PhaseConfig {
  label: string;
  color: string;
  bg: string;
}

export interface ProfilingContextValue {
  hovered: Span | null;
  setHovered: (s: Span | null) => void;
  refreshKey: number;
}

export const ProfilingContext = createContext<ProfilingContextValue | null>(null);

export function useProfilingContext(): ProfilingContextValue {
  const ctx = useContext(ProfilingContext);
  if (!ctx) throw new Error("useProfilingContext requires ProfilingContext");
  return ctx;
}

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

export function groupByPhase(spans: Span[]): {
  all: Map<string, Span[]>;
  visible: Map<string, Span[]>;
} {
  const all = new Map<string, Span[]>();
  for (const span of spans) {
    const list = all.get(span.phase) ?? [];
    list.push(span);
    all.set(span.phase, list);
  }
  const visible = new Map<string, Span[]>();
  for (const [phase, list] of all) {
    const nonZero = list.filter((s) => s.durationMs > 0);
    nonZero.sort((a, b) => b.durationMs - a.durationMs);
    visible.set(phase, nonZero);
  }
  return { all, visible };
}

const LABEL_WIDTH = 160; // w-40
const DURATION_WIDTH = 64; // w-16
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

export function GanttSection({
  title,
  totalMs,
  phaseOrder,
  phaseConfig,
  allByPhase,
  visibleByPhase,
}: {
  title: string;
  totalMs: number;
  phaseOrder: string[];
  phaseConfig: Record<string, PhaseConfig>;
  allByPhase: Map<string, Span[]>;
  visibleByPhase: Map<string, Span[]>;
}): ReactElement {
  const { hovered, setHovered } = useProfilingContext();
  const zoom = useGanttZoom();
  const containerRef = useRef<HTMLDivElement>(null);

  const { drag, handlePointerDown } = useGanttDrag(
    containerRef,
    (s, e) => zoom.zoomTo(s, e, totalMs),
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
      {phaseOrder.map((phase) => {
        const allSpans = allByPhase.get(phase);
        if (!allSpans || allSpans.length === 0) return null;
        const visibleSpans = visibleByPhase.get(phase) ?? [];
        const config = phaseConfig[phase];
        if (!config) return null;
        return (
          <PhaseGroup
            key={phase}
            config={config}
            allSpans={allSpans}
            spans={visibleSpans}
            total={totalMs}
            hovered={hovered}
            onHover={setHovered}
            toLeftPct={zoom.toLeftPct}
            toWidthPct={zoom.toWidthPct}
          />
        );
      })}
      <DragSelection drag={drag} />
    </div>
  );
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
            <span className="text-[10px] font-medium tabular-nums text-blue-500 dark:text-blue-400">
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

function PhaseGroup({
  config,
  allSpans,
  spans,
  total,
  hovered,
  onHover,
  toLeftPct,
  toWidthPct,
}: {
  config: PhaseConfig;
  allSpans: Span[];
  spans: Span[];
  total: number;
  hovered: Span | null;
  onHover: (s: Span | null) => void;
  toLeftPct: (ms: number, totalMs: number) => string;
  toWidthPct: (durationMs: number, totalMs: number) => string;
}): ReactElement {
  const phaseStart = Math.min(...allSpans.map((s) => s.startMs));
  const phaseEnd = Math.max(...allSpans.map((s) => s.startMs + s.durationMs));
  const phaseDuration = phaseEnd - phaseStart;
  const filteredCount = allSpans.length - spans.length;

  return (
    <div className={cn("border-b", config.bg)}>
      <div className="flex items-center gap-2 px-4 py-1.5">
        <div className={cn("size-2.5 rounded-full", config.color)} />
        <div className="text-xs font-semibold">{config.label}</div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatDuration(phaseDuration)}
        </div>
        <div className="text-xs text-muted-foreground">
          +{formatDuration(phaseStart)}
        </div>
        {filteredCount > 0 && (
          <div className="text-xs text-muted-foreground/60">
            ({filteredCount} &lt;1ms hidden)
          </div>
        )}
      </div>

      {spans.length > 0 && (
        <div className="space-y-0.5 px-4 pb-2">
          {spans.map((span) => (
            <SpanRow
              key={span.id}
              span={span}
              total={total}
              color={config.color}
              isHovered={hovered?.id === span.id}
              onHover={onHover}
              toLeftPct={toLeftPct}
              toWidthPct={toWidthPct}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SpanRow({
  span,
  total,
  color,
  isHovered,
  onHover,
  toLeftPct,
  toWidthPct,
}: {
  span: Span;
  total: number;
  color: string;
  isHovered: boolean;
  onHover: (s: Span | null) => void;
  toLeftPct: (ms: number, totalMs: number) => string;
  toWidthPct: (durationMs: number, totalMs: number) => string;
}): ReactElement {
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      onMouseEnter={() => onHover(span)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="w-40 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
        {span.label}
      </div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
        <div
          className={cn(
            "absolute top-0 h-full rounded transition-opacity",
            color,
            isHovered ? "opacity-100" : "opacity-70",
          )}
          style={{
            left: toLeftPct(span.startMs, total),
            width: toWidthPct(span.durationMs, total),
          }}
        />
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatDuration(span.durationMs)}
      </div>
    </div>
  );
}

export function SpanDetail({ span }: { span: Span | null }): ReactElement {
  return (
    <div className="border-t bg-muted/50 px-4 py-2 text-xs">
      {span ? (
        <>
          <span className="font-mono font-medium">{span.id}</span>
          <span className="mx-2 text-muted-foreground">&middot;</span>
          <span>
            Phase: <strong>{span.phase}</strong>
          </span>
          <span className="mx-2 text-muted-foreground">&middot;</span>
          <span>
            Start: <strong>+{formatDuration(span.startMs)}</strong>
          </span>
          <span className="mx-2 text-muted-foreground">&middot;</span>
          <span>
            Duration: <strong>{formatDuration(span.durationMs)}</strong>
          </span>
        </>
      ) : (
        <span className="text-muted-foreground/50">Hover a span to see details</span>
      )}
    </div>
  );
}
