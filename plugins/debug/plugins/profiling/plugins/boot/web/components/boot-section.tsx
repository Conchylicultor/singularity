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
  register: { label: "Register (sequential)", color: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  awaitPgReady: { label: "Await PG Ready", color: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  runMigrations: { label: "Run Migrations", color: "bg-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  routePopulation: { label: "Route Population", color: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  socketBind: { label: "Socket Bind", color: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" },
  onReady: { label: "onReady (parallel)", color: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/30" },
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
