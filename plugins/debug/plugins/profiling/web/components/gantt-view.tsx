import { useCallback, useEffect, useState, type ReactElement } from "react";
import { MdRefresh } from "react-icons/md";
import { cn } from "@/lib/utils";

type PhaseId =
  | "register"
  | "awaitPgReady"
  | "runMigrations"
  | "routePopulation"
  | "socketBind"
  | "onReady";

interface Span {
  id: string;
  phase: PhaseId;
  plugin?: string;
  label: string;
  startMs: number;
  durationMs: number;
}

interface ProfilingData {
  spans: Span[];
  totalDurationMs: number;
}

const PHASE_ORDER: PhaseId[] = [
  "register",
  "awaitPgReady",
  "runMigrations",
  "routePopulation",
  "socketBind",
  "onReady",
];

const PHASE_LABELS: Record<PhaseId, string> = {
  register: "Register (sequential)",
  awaitPgReady: "Await PG Ready",
  runMigrations: "Run Migrations",
  routePopulation: "Route Population",
  socketBind: "Socket Bind",
  onReady: "onReady (parallel)",
};

const PHASE_COLORS: Record<PhaseId, string> = {
  register: "bg-blue-500",
  awaitPgReady: "bg-amber-500",
  runMigrations: "bg-orange-500",
  routePopulation: "bg-emerald-500",
  socketBind: "bg-purple-500",
  onReady: "bg-sky-500",
};

const PHASE_BG: Record<PhaseId, string> = {
  register: "bg-blue-50 dark:bg-blue-950/30",
  awaitPgReady: "bg-amber-50 dark:bg-amber-950/30",
  runMigrations: "bg-orange-50 dark:bg-orange-950/30",
  routePopulation: "bg-emerald-50 dark:bg-emerald-950/30",
  socketBind: "bg-purple-50 dark:bg-purple-950/30",
  onReady: "bg-sky-50 dark:bg-sky-950/30",
};

export function GanttView(): ReactElement {
  const [data, setData] = useState<ProfilingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/debug/profiling");
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      setData((await res.json()) as ProfilingData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!data || data.spans.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No profiling data available.
      </div>
    );
  }

  const allByPhase = new Map<PhaseId, Span[]>();
  for (const span of data.spans) {
    const list = allByPhase.get(span.phase) ?? [];
    list.push(span);
    allByPhase.set(span.phase, list);
  }

  const byPhase = new Map<PhaseId, Span[]>();
  for (const [phase, spans] of allByPhase) {
    const nonZero = spans.filter((s) => s.durationMs > 0);
    nonZero.sort((a, b) => b.durationMs - a.durationMs);
    byPhase.set(phase, nonZero);
  }

  const total = data.totalDurationMs;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="text-sm font-medium">Boot time</div>
        <div className="font-mono text-sm tabular-nums text-muted-foreground">
          {total.toLocaleString()} ms
        </div>
        <div className="flex-1" />
        <button
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          onClick={() => void load()}
        >
          <MdRefresh className="size-3.5" />
          Refresh
        </button>
      </div>

      <TimeAxis totalMs={total} />

      <div className="flex-1 overflow-y-auto">
        {PHASE_ORDER.map((phase) => {
          const allSpans = allByPhase.get(phase);
          if (!allSpans || allSpans.length === 0) return null;
          const visibleSpans = byPhase.get(phase) ?? [];
          return (
            <PhaseGroup
              key={phase}
              phase={phase}
              allSpans={allSpans}
              spans={visibleSpans}
              total={total}
              hovered={hovered}
              onHover={setHovered}
            />
          );
        })}
      </div>

      {hovered && <SpanDetail span={data.spans.find((s) => s.id === hovered)} />}
    </div>
  );
}

function TimeAxis({ totalMs }: { totalMs: number }): ReactElement {
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((i / tickCount) * totalMs),
  );

  return (
    <div className="relative flex h-6 border-b px-4">
      <div className="w-40 shrink-0" />
      <div className="relative flex-1">
        {ticks.map((ms) => (
          <div
            key={ms}
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${(ms / totalMs) * 100}%` }}
          >
            <div className="h-2 w-px bg-border" />
            <span className="text-[9px] tabular-nums text-muted-foreground">
              {ms}ms
            </span>
          </div>
        ))}
      </div>
      <div className="w-16 shrink-0" />
    </div>
  );
}

function PhaseGroup({
  phase,
  allSpans,
  spans,
  total,
  hovered,
  onHover,
}: {
  phase: PhaseId;
  allSpans: Span[];
  spans: Span[];
  total: number;
  hovered: string | null;
  onHover: (id: string | null) => void;
}): ReactElement {
  const phaseStart = Math.min(...allSpans.map((s) => s.startMs));
  const phaseEnd = Math.max(...allSpans.map((s) => s.startMs + s.durationMs));
  const phaseDuration = phaseEnd - phaseStart;
  const filteredCount = allSpans.length - spans.length;

  return (
    <div className={cn("border-b", PHASE_BG[phase])}>
      <div className="flex items-center gap-2 px-4 py-1.5">
        <div className={cn("size-2.5 rounded-full", PHASE_COLORS[phase])} />
        <div className="text-xs font-semibold">{PHASE_LABELS[phase]}</div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {phaseDuration.toLocaleString()} ms
        </div>
        <div className="text-xs text-muted-foreground">
          +{phaseStart.toLocaleString()} ms
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
              phase={phase}
              isHovered={hovered === span.id}
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
  phase,
  isHovered,
  onHover,
}: {
  span: Span;
  total: number;
  phase: PhaseId;
  isHovered: boolean;
  onHover: (id: string | null) => void;
}): ReactElement {
  const leftPct = `${(span.startMs / total) * 100}%`;
  const widthPct = `${Math.max((span.durationMs / total) * 100, 0.3)}%`;

  return (
    <div
      className="flex items-center gap-2 py-0.5"
      onMouseEnter={() => onHover(span.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="w-40 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
        {span.label}
      </div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
        <div
          className={cn(
            "absolute top-0 h-full rounded transition-opacity",
            PHASE_COLORS[phase],
            isHovered ? "opacity-100" : "opacity-70",
          )}
          style={{ left: leftPct, width: widthPct }}
        />
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {span.durationMs} ms
      </div>
    </div>
  );
}

function SpanDetail({ span }: { span: Span | undefined }): ReactElement | null {
  if (!span) return null;
  return (
    <div className="border-t bg-muted/50 px-4 py-2 text-xs">
      <span className="font-mono font-medium">{span.id}</span>
      <span className="mx-2 text-muted-foreground">&middot;</span>
      <span>
        Phase: <strong>{span.phase}</strong>
      </span>
      <span className="mx-2 text-muted-foreground">&middot;</span>
      <span>
        Start: <strong>+{span.startMs} ms</strong>
      </span>
      <span className="mx-2 text-muted-foreground">&middot;</span>
      <span>
        Duration: <strong>{span.durationMs} ms</strong>
      </span>
    </div>
  );
}
