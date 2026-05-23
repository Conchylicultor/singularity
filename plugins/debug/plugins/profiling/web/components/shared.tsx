import { createContext, useContext, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  GanttContainer,
  useGanttContainerContext,
} from "./gantt-container";

export { formatDuration } from "./gantt-container";

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
  return (
    <GanttContainer title={title} totalMs={totalMs}>
      {phaseOrder.map((phase) => {
        const allSpans = allByPhase.get(phase);
        if (!allSpans || allSpans.length === 0) return null;
        const config = phaseConfig[phase];
        if (!config) return null;
        return (
          <PhaseGroup
            key={phase}
            config={config}
            allSpans={allSpans}
            spans={visibleByPhase.get(phase) ?? []}
          />
        );
      })}
    </GanttContainer>
  );
}

export function PhaseGroup({
  config,
  allSpans,
  spans,
}: {
  config: PhaseConfig;
  allSpans: Span[];
  spans: Span[];
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
            <SpanRow key={span.id} span={span} color={config.color} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpanRow({
  span,
  color,
}: {
  span: Span;
  color: string;
}): ReactElement {
  const { toLeftPct, toWidthPct, totalMs } = useGanttContainerContext();
  const { hovered, setHovered } = useProfilingContext();
  const isHovered = hovered?.id === span.id;
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      onMouseEnter={() => setHovered(span)}
      onMouseLeave={() => setHovered(null)}
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
            left: toLeftPct(span.startMs, totalMs),
            width: toWidthPct(span.durationMs, totalMs),
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
