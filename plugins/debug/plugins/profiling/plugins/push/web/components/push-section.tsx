import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttSection,
  groupByPhase,
  useProfilingContext,
  type Span,
  type PhaseConfig,
} from "@plugins/debug/plugins/profiling/web";

interface Phase {
  id: string;
  label: string;
  outcome: string;
  branch: string;
}

interface PushData {
  spans: Span[];
  totalMs: number;
  phases: Phase[];
}

const OUTCOME_STYLES: Record<string, { color: string; bg: string }> = {
  success: {
    color: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  failed_rebase: {
    color: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  failed_checks: {
    color: "bg-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  failed_push: {
    color: "bg-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  error: {
    color: "bg-gray-500",
    bg: "bg-gray-50 dark:bg-gray-950/30",
  },
};

const DEFAULT_STYLE = {
  color: "bg-gray-400",
  bg: "bg-gray-50 dark:bg-gray-950/30",
};

export function PushSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<PushData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/profiling/push");
      if (!res.ok) return;
      setData((await res.json()) as PushData);
    } catch {
      // debug tool — silent on fetch errors
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!data || data.spans.length === 0) return null;

  const phaseOrder = data.phases.map((p) => p.id);

  const phaseConfig: Record<string, PhaseConfig> = {};
  for (const phase of data.phases) {
    const style = OUTCOME_STYLES[phase.outcome] ?? DEFAULT_STYLE;
    phaseConfig[phase.id] = {
      label: `${phase.branch} (${phase.outcome})`,
      ...style,
    };
  }

  const grouped = groupByPhase(data.spans);
  return (
    <GanttSection
      title="Push"
      totalMs={data.totalMs}
      phaseOrder={phaseOrder}
      phaseConfig={phaseConfig}
      allByPhase={grouped.all}
      visibleByPhase={grouped.visible}
    />
  );
}
