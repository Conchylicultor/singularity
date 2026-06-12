import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { configV2ConflictsResource } from "@plugins/config_v2/core";
import type { ConfigV2Conflicts } from "@plugins/config_v2/core";

// Raw gateable result — never collapse `pending` into `{}` (that hides
// "still loading" from "genuinely no conflicts"). Callers gate.
// `scopeId` selects which scope's conflicts map to read (undefined = Base).
export function useConflicts(scopeId?: string): ResourceResult<ConfigV2Conflicts> {
  return useResource(configV2ConflictsResource, scopeId ? { scopeId } : {});
}
