import { useEffect, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
} from "@plugins/debug/plugins/profiling/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { BUILD_PHASE_ORDER, BUILD_PHASE_CONFIG } from "../phases";
import { getBuildProfiling } from "../../shared/endpoints";

export function BuildSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const { data, refetch } = useEndpoint(getBuildProfiling, {});

  // refetch is not a state setter, so this effect is clean (no set-state-in-effect).
  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  if (!data || data.spans.length === 0) return null;

  const grouped = groupByPhase(data.spans);
  return (
    <GanttSection
      title="Build"
      totalMs={data.totalMs}
      phaseOrder={BUILD_PHASE_ORDER}
      phaseConfig={BUILD_PHASE_CONFIG}
      allByPhase={grouped.all}
      visibleByPhase={grouped.visible}
    />
  );
}
