import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
  type Span,
  type PhaseConfig,
} from "@plugins/debug/plugins/profiling/web";

interface BootData {
  spans: Span[];
  totalMs: number;
}

const PHASE_ORDER = [
  "register",
  "awaitPgReady",
  "runMigrations",
  "routePopulation",
  "socketBind",
  "onReady",
];

const PHASE_CONFIG: Record<string, PhaseConfig> = {
  register: { label: "Register (sequential)", color: "bg-categorical-1", bg: "bg-categorical-1/10" },
  awaitPgReady: { label: "Await PG Ready", color: "bg-categorical-2", bg: "bg-categorical-2/10" },
  runMigrations: { label: "Run Migrations", color: "bg-categorical-3", bg: "bg-categorical-3/10" },
  routePopulation: { label: "Route Population", color: "bg-categorical-4", bg: "bg-categorical-4/10" },
  socketBind: { label: "Socket Bind", color: "bg-categorical-5", bg: "bg-categorical-5/10" },
  onReady: { label: "onReady (parallel)", color: "bg-categorical-6", bg: "bg-categorical-6/10" },
};

export function BootSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<BootData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/profiling/boot");
      if (!res.ok) return;
      setData((await res.json()) as BootData);
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
      title="Boot"
      totalMs={data.totalMs}
      phaseOrder={PHASE_ORDER}
      phaseConfig={PHASE_CONFIG}
      allByPhase={grouped.all}
      visibleByPhase={grouped.visible}
    />
  );
}
