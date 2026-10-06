import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Hook } from "@plugins/framework/plugins/hook-value/core";
import type { Activity } from "@plugins/primitives/plugins/css/plugins/activity-ring/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";

type Report = (id: string, activity: Activity | null) => void;

function sameActivity(a: Activity | undefined, b: Activity | null): boolean {
  if (a === undefined || b === null) return a === undefined && b === null;
  return a.state === b.state && a.label === b.label;
}

/**
 * One contribution's always-on reader. Its own component so the contribution's
 * hook runs unconditionally, once per contribution, however many there are (a
 * deferred plugin tier adding one just mounts another probe). Renders nothing.
 */
function ActivityProbe({
  id,
  useActivity,
  report,
}: {
  id: string;
  useActivity: Hook<() => Activity | null>;
  report: Report;
}): ReactNode {
  const activity = useActivity();
  useEffect(() => {
    report(id, activity);
  }, [report, id, activity]);
  useEffect(() => () => report(id, null), [report, id]);
  return null;
}

/**
 * Every `ActionBar.Activity` contribution's current answer, in contribution
 * order, plus the probes that read them (mount `probes` once, anywhere under
 * the caller). A crashing probe is contained by the plugin error boundary,
 * whose crash chip shows in the bar — loud, and only that contribution lost.
 */
export function useBarActivities(): {
  probes: ReactNode;
  activities: readonly Activity[];
} {
  const contributions = ActionBar.Activity.useContributions();
  const [byId, setById] = useState<Readonly<Record<string, Activity>>>({});
  // A stable setter: probes depend on it in their effects.
  const report = useCallback<Report>((id, activity) => {
    setById((prev) => {
      if (sameActivity(prev[id], activity)) return prev;
      const next = { ...prev };
      if (activity === null) delete next[id];
      else next[id] = activity;
      return next;
    });
  }, []);
  const probes = contributions.map((c) => (
    <PluginErrorBoundary
      key={c.id}
      slot={ActionBar.Activity.id}
      label={c._pluginId ?? c.id}
    >
      <ActivityProbe id={c.id} useActivity={c.useActivity} report={report} />
    </PluginErrorBoundary>
  ));
  const activities = contributions.flatMap((c) => byId[c.id] ?? []);
  return { probes, activities };
}
