import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { configV2ConflictResource, configV2ConflictPathsResource } from "@plugins/config_v2/core";
import type { ConfigV2ConflictEntry, ConfigV2ConflictPaths } from "@plugins/config_v2/core";

// One descriptor's conflict entry (or null) for the selected scope. Raw gateable
// result — never collapse `pending` into `null` (that hides "still loading" from
// "genuinely no conflict"). Callers gate. `scopeId` selects the scope (undefined
// = Base). Keyed per-path so opening one descriptor recomputes only that one.
export function useConflict(storePath: string, scopeId?: string): ResourceResult<ConfigV2ConflictEntry | null> {
  return useResource(configV2ConflictResource, { path: storePath, ...(scopeId ? { scopeId } : {}) });
}

// storePaths conflicting in the base scope OR any app scope — the aggregate that
// makes a scoped-only conflict visible in the nav badge and rail/sidebar dots
// without opening the descriptor. Gate on `pending` like useConflict.
export function useConflictPaths(): ResourceResult<ConfigV2ConflictPaths> {
  return useResource(configV2ConflictPathsResource, {});
}
