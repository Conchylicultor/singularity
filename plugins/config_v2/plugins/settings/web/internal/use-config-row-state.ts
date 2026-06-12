import { useMemo } from "react";
import { useConfig } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { useConflictPaths } from "./use-conflicts";

/**
 * Shared per-registration row state: how many fields differ from defaults and
 * whether the override is in conflict. Used by both the flat search row
 * (ConfigNavRow) and the tree row (ConfigTreeNode).
 *
 * `hasConflict` aggregates the base scope AND every app scope, so a stale
 * scoped override surfaces the warning badge here without opening the descriptor.
 */
export function useConfigRowState(registration: ConfigRegistration): {
  modifiedCount: number;
  hasConflict: boolean;
} {
  const values = useConfig(registration.descriptor);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;
  const conflictPathsRes = useConflictPaths();
  const hasConflict =
    !conflictPathsRes.pending && conflictPathsRes.data.includes(registration.storePath);

  const modifiedCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(registration.descriptor.fields)) {
      if (values[key] !== defaults[key]) count++;
    }
    return count;
  }, [values, defaults, registration.descriptor.fields]);

  return { modifiedCount, hasConflict };
}
