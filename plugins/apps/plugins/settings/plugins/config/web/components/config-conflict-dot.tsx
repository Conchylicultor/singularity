import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ConflictsResource } from "@plugins/config_v2/core";

/**
 * Settings rail-icon attention dot for config conflicts. Mirrors the dot the
 * config sidebar entry already shows, reading the same conflicts resource, so
 * an unresolved config conflict is visible from the app rail without opening
 * Settings.
 */
export function ConfigConflictDot() {
  const result = useResource(configV2ConflictsResource);
  const hasConflicts = !result.pending && Object.keys(result.data).length > 0;
  if (!hasConflicts) return null;
  return <span className="block size-2 rounded-full bg-warning" />;
}
