import { useMemo } from "react";
import { useConfig } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { useConflicts } from "./use-conflicts";

/**
 * Shared per-registration row state: how many fields differ from defaults and
 * whether the override is in conflict. Used by both the flat search row
 * (ConfigNavRow) and the tree row (ConfigTreeNode).
 */
export function useConfigRowState(registration: ConfigRegistration): {
  modifiedCount: number;
  hasConflict: boolean;
} {
  const values = useConfig(registration.descriptor);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;
  const conflicts = useConflicts();
  const hasConflict = registration.storePath in conflicts;

  const modifiedCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(registration.descriptor.fields)) {
      if (values[key] !== defaults[key]) count++;
    }
    return count;
  }, [values, defaults, registration.descriptor.fields]);

  return { modifiedCount, hasConflict };
}
