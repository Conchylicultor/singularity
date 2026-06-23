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
  bootWindowEnd,
  type BootPhase,
  type BootSpan,
  type BootTrace,
} from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import { BootSummary } from "./boot-summary";
import { WaitWorkRow } from "./wait-work-row";

const PHASE_ORDER: BootPhase[] = [
  "navigation",
  "scripts",
  "main-thread",
  "assets",
  "boot-tasks",
  "resources",
  "paint",
];

const PHASE_CONFIG: Record<BootPhase, PhaseConfig> = {
  navigation: { label: "Navigation", color: "bg-categorical-1", bg: "bg-categorical-1/10" },
  scripts: { label: "Scripts", color: "bg-categorical-2", bg: "bg-categorical-2/10" },
  "main-thread": { label: "Main thread (long tasks)", color: "bg-categorical-6", bg: "bg-categorical-6/10" },
  assets: { label: "Assets (request + download)", color: "bg-categorical-7", bg: "bg-categorical-7/10" },
  "boot-tasks": { label: "Boot tasks", color: "bg-categorical-3", bg: "bg-categorical-3/10" },
  resources: { label: "Resources (wait + work)", color: "bg-categorical-4", bg: "bg-categorical-4/10" },
  paint: { label: "Paint", color: "bg-categorical-5", bg: "bg-categorical-5/10" },
};

/** Top-N assets (by transfer size) rendered as individual rows; the rest roll up. */
const ASSET_ROW_LIMIT = 8;

/** Human-readable byte size (KB up to 1 MB, then MB). */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

interface DerivedTrace {
  /** Profiling spans (navigation / scripts / main-thread / boot-tasks / paint) for SpanRow. */
  byPhase: Map<BootPhase, Span[]>;
  /** Raw resource boot spans (carry workMs) for WaitWorkRow. */
  resources: BootSpan[];
  /** Top-N asset spans (carry workMs = download) for WaitWorkRow, biggest first. */
  assets: BootSpan[];
  /** Assets beyond the row limit, summarized so nothing is silently dropped. */
  assetsDropped: { count: number; bytes: number };
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

  // Synthesize navigation-phase spans from Navigation Timing. The pre-request
  // sub-phases (unload/redirect, DNS, connect) are shown only when non-trivial,
  // so the common instant-localhost case stays clean — but a slow document
  // response is attributed to the right sub-phase instead of a blank 0→TTFB gap.
  const nav = trace.navigation;
  if (nav) {
    // Time from navigationStart to fetchStart = unload of the previous document
    // + any redirects. Often ~0 on a fresh load; surfaced when it isn't.
    if (nav.fetchStartMs > 1) {
      push("navigation", {
        id: "nav:fetch-start",
        phase: "navigation",
        label: "Unload / redirect",
        startMs: 0,
        durationMs: nav.fetchStartMs,
      });
    }
    const dns = nav.domainLookupEndMs - nav.domainLookupStartMs;
    if (dns > 1) {
      push("navigation", {
        id: "nav:dns",
        phase: "navigation",
        label: "DNS lookup",
        startMs: nav.domainLookupStartMs,
        durationMs: dns,
      });
    }
    const connect = nav.connectEndMs - nav.connectStartMs;
    if (connect > 1) {
      push("navigation", {
        id: "nav:connect",
        phase: "navigation",
        label: "TCP connect",
        startMs: nav.connectStartMs,
        durationMs: connect,
      });
    }
    const ttfb = Math.max(0, nav.responseStartMs - nav.requestStartMs);
    push("navigation", {
      id: "nav:ttfb",
      phase: "navigation",
      label: "Request → first byte (TTFB)",
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

  // Main-thread phase: each Long Task is a blocking bar. Clip to the boot window
  // (≤ FCP / first commit) so later interaction tasks don't leak in; when the
  // window end is unknown, show them all.
  const windowEnd = bootWindowEnd(trace);
  const bootTasks = windowEnd > 0
    ? trace.longTasks.filter((t) => t.startMs <= windowEnd)
    : trace.longTasks;
  bootTasks.forEach((t, i) => {
    push("main-thread", {
      id: `longtask:${i}`,
      phase: "main-thread",
      label: t.name === "self" ? "Long task" : t.name,
      startMs: t.startMs,
      durationMs: t.durationMs,
    });
    track(t.startMs + t.durationMs);
  });

  // Assets phase: scripts/stylesheets as wait (queue + request) + work (download)
  // rows, biggest first. Cap to ASSET_ROW_LIMIT rows; summarize the remainder.
  const assetSpans: BootSpan[] = [...trace.assets]
    .sort((a, b) => b.transferSize - a.transferSize)
    .map((a, i) => ({
      id: `asset:${i}`,
      phase: "assets" as BootPhase,
      label: a.name.split("/").pop() ?? a.name,
      startMs: a.startMs,
      durationMs: Math.max(0, a.responseEndMs - a.startMs),
      workMs: Math.max(0, a.responseEndMs - a.responseStartMs), // download = work
      detail: formatBytes(a.transferSize),
    }));
  for (const a of assetSpans) track(a.startMs + a.durationMs);
  const assets = assetSpans.slice(0, ASSET_ROW_LIMIT);
  const rest = [...trace.assets]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(ASSET_ROW_LIMIT);
  const assetsDropped = {
    count: rest.length,
    bytes: rest.reduce((sum, a) => sum + a.transferSize, 0),
  };

  // Round up slightly so the last bar/marker isn't flush against the edge.
  const totalMs = Math.ceil(maxEnd * 1.02) || 1;
  return { byPhase, resources, assets, assetsDropped, totalMs };
}

/** Legend with a dim (wait) + solid (work/download) swatch, color-matched to the phase. */
function WaitWorkLegend({
  dimClass,
  solidClass,
  dimLabel,
  solidLabel,
}: {
  dimClass: string;
  solidClass: string;
  dimLabel: string;
  solidLabel: string;
}): ReactElement {
  return (
    <Stack direction="row" align="center" gap="md">
      <Stack direction="row" align="center" gap="xs">
        <div className={cn("size-2.5 rounded-sm", dimClass)} />
        <Text as="span" variant="caption" className="text-muted-foreground">
          {dimLabel}
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap="xs">
        <div className={cn("size-2.5 rounded-sm", solidClass)} />
        <Text as="span" variant="caption" className="text-muted-foreground">
          {solidLabel}
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
        <WaitWorkLegend
          dimClass="bg-categorical-4/40"
          solidClass="bg-categorical-4"
          dimLabel="wait"
          solidLabel="work"
        />
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

/**
 * Assets-phase group. Mirrors ResourcesGroup but renders the top-N scripts/
 * stylesheets (biggest first) as wait/download rows, with a rollup row for the
 * remainder so the full transfer cost is never silently hidden.
 */
function AssetsGroup({
  config,
  assets,
  dropped,
}: {
  config: PhaseConfig;
  assets: BootSpan[];
  dropped: { count: number; bytes: number };
}): ReactElement | null {
  if (assets.length === 0) return null;
  const phaseStart = Math.min(...assets.map((s) => s.startMs));
  const phaseEnd = Math.max(...assets.map((s) => s.startMs + s.durationMs));

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
        <WaitWorkLegend
          dimClass="bg-categorical-7/40"
          solidClass="bg-categorical-7"
          dimLabel="request"
          solidLabel="download"
        />
      </Stack>

      <Stack gap="2xs" className="px-lg pb-sm">
        {assets.map((a) => (
          <WaitWorkRow
            key={a.id}
            id={a.id}
            phase={a.phase}
            label={a.label}
            startMs={a.startMs}
            durationMs={a.durationMs}
            workMs={a.workMs}
            detail={a.detail}
            waitClass="bg-categorical-7/40"
            workClass="bg-categorical-7"
          />
        ))}
        {dropped.count > 0 && (
          <Text as="div" variant="caption" className="px-lg pt-2xs font-mono text-muted-foreground">
            +{dropped.count} more chunks · {formatBytes(dropped.bytes)}
          </Text>
        )}
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
                  if (phase === "assets") {
                    return (
                      <AssetsGroup
                        key={phase}
                        config={config}
                        assets={derived.assets}
                        dropped={derived.assetsDropped}
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
