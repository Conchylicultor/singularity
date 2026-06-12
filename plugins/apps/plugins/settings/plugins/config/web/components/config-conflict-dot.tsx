import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ConflictPathsResource } from "@plugins/config_v2/core";

/**
 * Settings rail-icon attention dot for config conflicts. Mirrors the dot the
 * config sidebar entry already shows, reading the same aggregate conflict-paths
 * resource (base + every app scope), so an unresolved config conflict — base or
 * scoped-only — is visible from the app rail without opening Settings.
 */
export function ConfigConflictDot() {
  const result = useResource(configV2ConflictPathsResource);
  const hasConflicts = !result.pending && result.data.length > 0;
  if (!hasConflicts) return null;
  return <span className="block size-2 rounded-full bg-warning" />;
}
