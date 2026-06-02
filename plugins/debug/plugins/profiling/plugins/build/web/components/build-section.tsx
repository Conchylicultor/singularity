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
  "build:preflight": { label: "Preflight", color: "bg-categorical-1", bg: "bg-categorical-1/10" },
  "build:setup": { label: "Setup", color: "bg-categorical-2", bg: "bg-categorical-2/10" },
  "build:codegen": { label: "Codegen", color: "bg-categorical-3", bg: "bg-categorical-3/10" },
  "build:database": { label: "Database", color: "bg-categorical-4", bg: "bg-categorical-4/10" },
  "build:validation": { label: "Validation", color: "bg-categorical-5", bg: "bg-categorical-5/10" },
  "build:checks": { label: "Checks", color: "bg-categorical-6", bg: "bg-categorical-6/10" },
  "build:frontend": { label: "Frontend", color: "bg-categorical-7", bg: "bg-categorical-7/10" },
  "build:deploy": { label: "Deploy", color: "bg-categorical-8", bg: "bg-categorical-8/10" },
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
