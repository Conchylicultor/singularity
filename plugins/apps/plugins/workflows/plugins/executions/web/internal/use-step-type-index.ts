import { useMemo } from "react";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";

/**
 * Index the contributed `Workflows.StepType` data slot by `pluginId` so an
 * execution step trace can look up its icon, label, and (unsealed)
 * `executionComponent` by `step.stepPluginId`. Collection-consumer clean:
 * never names a specific step-type contributor.
 */
export function useStepTypeIndex() {
  const contributions = Workflows.StepType.useContributions();
  return useMemo(() => {
    const map = new Map<string, (typeof contributions)[number]>();
    for (const c of contributions) map.set(c.pluginId, c);
    return map;
  }, [contributions]);
}
