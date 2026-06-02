import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
  type Span,
  type PhaseConfig,
} from "@plugins/debug/plugins/profiling/web";

interface StatsData {
  spans: Span[];
  totalMs: number;
}

const PHASE_ORDER = [
  "stats:commits",
  "stats:cost",
  "stats:tasks",
];

const PHASE_CONFIG: Record<string, PhaseConfig> = {
  "stats:commits": { label: "Commits", color: "bg-categorical-1", bg: "bg-categorical-1/10" },
  "stats:cost": { label: "Cost", color: "bg-categorical-2", bg: "bg-categorical-2/10" },
  "stats:tasks": { label: "Tasks", color: "bg-categorical-3", bg: "bg-categorical-3/10" },
};

export function StatsSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<StatsData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/profiling/stats");
      if (!res.ok) return;
      setData((await res.json()) as StatsData);
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // debug tool — silent on fetch errors
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!data || data.spans.length === 0) return null;

  const grouped = groupByPhase(data.spans);
  return (
    <GanttSection
      title="Stats"
      totalMs={data.totalMs}
      phaseOrder={PHASE_ORDER}
      phaseConfig={PHASE_CONFIG}
      allByPhase={grouped.all}
      visibleByPhase={grouped.visible}
    />
  );
}
