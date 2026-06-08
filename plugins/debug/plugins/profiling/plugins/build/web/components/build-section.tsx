import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { BUILD_PHASE_ORDER, BUILD_PHASE_CONFIG } from "../phases";
import { getBuildProfiling } from "../../shared/endpoints";

interface BuildData {
  spans: Span[];
  totalMs: number;
}

export function BuildSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<BuildData | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchEndpoint(getBuildProfiling, {}));
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
      title="Build"
      totalMs={data.totalMs}
      phaseOrder={BUILD_PHASE_ORDER}
      phaseConfig={BUILD_PHASE_CONFIG}
      allByPhase={grouped.all}
      visibleByPhase={grouped.visible}
    />
  );
}
