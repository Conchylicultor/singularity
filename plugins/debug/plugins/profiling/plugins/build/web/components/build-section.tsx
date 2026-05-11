import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
  type Span,
  type PhaseConfig,
} from "@plugins/debug/plugins/profiling/web";

interface BuildData {
  spans: Span[];
  totalMs: number;
}

const PHASE_ORDER = [
  "build:preflight",
  "build:setup",
  "build:codegen",
  "build:database",
  "build:validation",
  "build:checks",
  "build:frontend",
  "build:deploy",
];

const PHASE_CONFIG: Record<string, PhaseConfig> = {
  "build:preflight": { label: "Preflight", color: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30" },
  "build:setup": { label: "Setup", color: "bg-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  "build:codegen": { label: "Codegen", color: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  "build:database": { label: "Database", color: "bg-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  "build:validation": { label: "Validation", color: "bg-lime-500", bg: "bg-lime-50 dark:bg-lime-950/30" },
  "build:checks": { label: "Checks", color: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  "build:frontend": { label: "Frontend", color: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/30" },
  "build:deploy": { label: "Deploy", color: "bg-teal-500", bg: "bg-teal-50 dark:bg-teal-950/30" },
};

export function BuildSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<BuildData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/profiling/build");
      if (!res.ok) return;
      setData((await res.json()) as BuildData);
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
      phaseOrder={PHASE_ORDER}
      phaseConfig={PHASE_CONFIG}
      allByPhase={grouped.all}
      visibleByPhase={grouped.visible}
    />
  );
}
