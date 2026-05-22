import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ConflictsResource } from "@plugins/config_v2/core";
import type { ConfigV2Conflicts } from "@plugins/config_v2/core";

export function useConflicts(): ConfigV2Conflicts {
  const result = useResource(configV2ConflictsResource);
  if (result.pending) return {};
  return result.data;
}
