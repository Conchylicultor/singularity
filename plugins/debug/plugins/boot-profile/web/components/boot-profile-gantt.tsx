import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { MdRefresh, MdReplay } from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  GanttContainer,
  PhaseGroup,
  ProfilingContext,
  SpanDetail,
  formatDuration,
  type PhaseConfig,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import {
  getBootTrace,
  subscribeBootTrace,
  type BootPhase,
  type BootSpan,
  type BootTrace,
} from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import { BootSummary } from "./boot-summary";
import { WaitWorkRow } from "./wait-work-row";

const PHASE_ORDER: BootPhase[] = [
  "navigation",
  "scripts",
  "boot-tasks",
  "resources",
  "paint",
];

const PHASE_CONFIG: Record<BootPhase, PhaseConfig> = {
  navigation: { label: "Navigation", color: "bg-categorical-1", bg: "bg-categorical-1/10" },
  scripts: { label: "Scripts", color: "bg-categorical-2", bg: "bg-categorical-2/10" },
  "boot-tasks": { label: "Boot tasks", color: "bg-categorical-3", bg: "bg-categorical-3/10" },
  resources: { label: "Resources (wait + work)", color: "bg-categorical-4", bg: "bg-categorical-4/10" },
  paint: { label: "Paint", color: "bg-categorical-5", bg: "bg-categorical-5/10" },
};

interface DerivedTrace {
  /** Profiling spans (navigation / scripts / boot-tasks / paint) for SpanRow. */
  byPhase: Map<BootPhase, Span[]>;
  /** Raw resource boot spans (carry workMs) for WaitWorkRow. */
  resources: BootSpan[];
  totalMs: number;
}

/** Convert a BootTrace into per-phase spans plus the resource spans + totalMs. */
function deriveTrace(trace: BootTrace): DerivedTrace {
  const byPhase = new Map<BootPhase, Span[]>();
  const resources: BootSpan[] = [];
  const push = (phase: BootPhase, span: Span): void => {
    const list = byPhase.get(phase) ?? [];
    list.push(span);
    byPhase.set(phase, list);
  };

  let maxEnd = 0;
  const track = (endMs: number): void => {
    if (endMs > maxEnd) maxEnd = endMs;
  };

  for (const s of trace.spans) {
    track(s.startMs + s.durationMs);
    if (s.phase === "resources") {
      resources.push(s);
    } else {
      push(s.phase, {
        id: s.id,
        phase: s.phase,
        label: s.label,
        startMs: s.startMs,
        durationMs: s.durationMs,
      });
    }
  }

  // Synthesize navigation-phase spans from Navigation Timing.
  const nav = trace.navigation;
  if (nav) {
    const ttfb = Math.max(0, nav.responseStartMs - nav.requestStartMs);
    push("navigation", {
      id: "nav:ttfb",
      phase: "navigation",
      label: "TTFB",
      startMs: nav.requestStartMs,
      durationMs: ttfb,
    });
    push("navigation", {
      id: "nav:response",
      phase: "navigation",
      label: "Response download",
      startMs: nav.responseStartMs,
      durationMs: Math.max(0, nav.responseEndMs - nav.responseStartMs),
    });
    push("navigation", {
      id: "nav:dom-interactive",
      phase: "navigation",
      label: "DOM interactive",
      startMs: nav.domInteractiveMs,
      durationMs: 0,
    });
    push("navigation", {
      id: "nav:dcl",
      phase: "navigation",
      label: "DOMContentLoaded end",
      startMs: nav.domContentLoadedEndMs,
      durationMs: 0,
    });
    track(nav.responseEndMs);
    track(nav.domInteractiveMs);
    track(nav.domContentLoadedEndMs);
  }

  // Synthesize paint-phase markers.
  const { firstPaintMs, firstContentfulPaintMs } = trace.paint;
  if (firstPaintMs !== null) {
    push("paint", {
      id: "paint:first-paint",
      phase: "paint",
      label: "First paint",
      startMs: firstPaintMs,
      durationMs: 0,
    });
    track(firstPaintMs);
  }
  if (firstContentfulPaintMs !== null) {
    push("paint", {
      id: "paint:first-contentful-paint",
      phase: "paint",
      label: "First-contentful-paint",
      startMs: firstContentfulPaintMs,
      durationMs: 0,
    });
    track(firstContentfulPaintMs);
  }
  if (trace.firstCommitMs !== null) {
    push("paint", {
      id: "paint:first-commit",
      phase: "paint",
      label: "First React commit",
      startMs: trace.firstCommitMs,
      durationMs: 0,
    });
    track(trace.firstCommitMs);
  }

  for (const r of resources) track(r.startMs + r.durationMs);

  // Round up slightly so the last bar/marker isn't flush against the edge.
  const totalMs = Math.ceil(maxEnd * 1.02) || 1;
  return { byPhase, resources, totalMs };
}

/** Legend swatch + label for the wait/work segments. */
function WaitWorkLegend(): ReactElement {
  return (
    <Stack direction="row" align="center" gap="md">
      <Stack direction="row" align="center" gap="xs">
        <div className="size-2.5 rounded-sm bg-categorical-4/40" />
        <Text as="span" variant="caption" className="text-muted-foreground">
          wait
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap="xs">
        <div className="size-2.5 rounded-sm bg-categorical-4" />
        <Text as="span" variant="caption" className="text-muted-foreground">
          work
        </Text>
      </Stack>
    </Stack>
  );
}

/**
 * Resources-phase group. Mirrors PhaseGroup's header + rows shape (read from
 * shared.tsx), but renders WaitWorkRow per resource instead of SpanRow and
 * carries a wait/work legend in the header.
 */
function ResourcesGroup({
  config,
  resources,
}: {
  config: PhaseConfig;
  resources: BootSpan[];
}): ReactElement | null {
  if (resources.length === 0) return null;
  const sorted = [...resources].sort((a, b) => b.durationMs - a.durationMs);
  const phaseStart = Math.min(...resources.map((s) => s.startMs));
  const phaseEnd = Math.max(...resources.map((s) => s.startMs + s.durationMs));

  return (
    <div className={cn("border-b", config.bg)}>
      <Stack direction="row" align="center" gap="sm" className="px-lg py-xs">
        <div className={cn("size-2.5 rounded-full", config.color)} />
        <Text as="div" variant="caption" className="font-semibold">
          {config.label}
        </Text>
        <Text as="div" variant="caption" className="font-mono tabular-nums text-muted-foreground">
          {formatDuration(phaseEnd - phaseStart)}
        </Text>
        <Text as="div" variant="caption" className="text-muted-foreground">
          +{formatDuration(phaseStart)}
        </Text>
        <WaitWorkLegend />
      </Stack>

      <Stack gap="2xs" className="px-lg pb-sm">
        {sorted.map((r) => (
          <WaitWorkRow
            key={r.id}
            id={r.id}
            phase={r.phase}
            label={r.label}
            startMs={r.startMs}
            durationMs={r.durationMs}
            workMs={r.workMs}
            detail={r.detail}
          />
        ))}
      </Stack>
    </div>
  );
}

export function BootProfileGantt(): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [trace, setTrace] = useState<BootTrace | null>(null);

  useEffect(() => {
    setTrace(getBootTrace());
  }, [refreshKey]);

  // Re-read when the store notifies — late paint timing (FCP / first-paint), the
  // first React commit, or new boot spans. Push-based (PerformanceObserver +
  // subscriber set), so no polling. Fires a bounded number of times during boot.
  useEffect(() => subscribeBootTrace(() => setTrace(getBootTrace())), []);

  const ctxValue = useMemo(
    () => ({ hovered, setHovered, refreshKey }),
    [hovered, setHovered, refreshKey],
  );

  const derived = useMemo(
    () => (trace ? deriveTrace(trace) : null),
    [trace],
  );

  return (
    <ProfilingContext.Provider value={ctxValue}>
      <Column
        className="h-full"
        header={
          // eslint-disable-next-line layout/no-adhoc-layout -- header strip mirrors gantt-view.tsx
          <div className="flex items-center gap-sm border-b px-lg py-sm">
            {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible spacer pushing buttons to the right (mirrors gantt-view.tsx) */}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
              <MdRefresh className="size-3.5" />
              Refresh
            </Button>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              <MdReplay className="size-3.5" />
              Reload & re-measure
            </Button>
          </div>
        }
        body={
          derived && trace ? (
            <div className="divide-y">
              <BootSummary trace={trace} />
              <GanttContainer title="Browser Boot" totalMs={derived.totalMs}>
                {PHASE_ORDER.map((phase) => {
                  const config = PHASE_CONFIG[phase];
                  if (phase === "resources") {
                    return (
                      <ResourcesGroup
                        key={phase}
                        config={config}
                        resources={derived.resources}
                      />
                    );
                  }
                  const spans = derived.byPhase.get(phase);
                  if (!spans || spans.length === 0) return null;
                  const visible = [...spans].sort(
                    (a, b) => b.durationMs - a.durationMs,
                  );
                  return (
                    <PhaseGroup
                      key={phase}
                      config={config}
                      allSpans={spans}
                      spans={visible}
                    />
                  );
                })}
              </GanttContainer>
            </div>
          ) : (
            <Text as="div" variant="caption" className="px-lg py-sm text-muted-foreground">
              No boot trace captured.
            </Text>
          )
        }
        footer={<SpanDetail span={hovered} />}
      />
    </ProfilingContext.Provider>
  );
}
