import { createContext, useContext, type ReactElement } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { cn } from "@/lib/utils";

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

  return (
    <>
      <TimeAxis title={title} totalMs={totalMs} />
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
          />
        );
      })}
    </>
  );
}

function TimeAxis({
  title,
  totalMs,
}: {
  title: string;
  totalMs: number;
}): ReactElement {
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((i / tickCount) * totalMs),
  );

  return (
    <div className="relative flex h-6 border-b px-4">
      <div className="flex w-40 shrink-0 items-center gap-1.5">
        <SectionLabel as="span" className="text-[10px] font-medium tracking-wider">
          {title}
        </SectionLabel>
        <span className="text-[10px] font-medium tabular-nums text-foreground">
          {formatDuration(totalMs)}
        </span>
      </div>
      <div className="relative flex-1">
        {ticks.map((ms) => (
          <div
            key={ms}
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${(ms / totalMs) * 100}%` }}
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
}: {
  config: PhaseConfig;
  allSpans: Span[];
  spans: Span[];
  total: number;
  hovered: Span | null;
  onHover: (s: Span | null) => void;
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
}: {
  span: Span;
  total: number;
  color: string;
  isHovered: boolean;
  onHover: (s: Span | null) => void;
}): ReactElement {
  const leftPct = `${(span.startMs / total) * 100}%`;
  const widthPct = `${Math.max((span.durationMs / total) * 100, 0.3)}%`;

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
          style={{ left: leftPct, width: widthPct }}
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
