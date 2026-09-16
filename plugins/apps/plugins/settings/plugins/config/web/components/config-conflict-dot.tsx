import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ConflictMapResource } from "@plugins/config_v2/core";

/**
 * Attention dot for config conflicts, reading the aggregate conflict-locations
 * resource (base + every app scope) so a scoped-only conflict is visible too.
 * Rendered in two places: on the Settings rail icon (so a conflict shows without
 * opening Settings) and as the badge on the Config sidebar entry's icon.
 */
export function ConfigConflictDot() {
  const result = useResource(configV2ConflictMapResource);
  const hasConflicts = !result.pending && Object.keys(result.data).length > 0;
  if (!hasConflicts) return null;
  return <span className="block size-2 rounded-full bg-warning" />;
}
