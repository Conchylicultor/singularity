import { useEffect, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
  type PhaseConfig,
} from "@plugins/debug/plugins/profiling/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getStatsProfiling } from "../../shared/endpoints";

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
  const { data, refetch } = useEndpoint(getStatsProfiling, {});

  // refetch is not a state setter, so this effect is clean (no set-state-in-effect).
  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

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
