import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldIdentity } from "@plugins/fields/core";

/**
 * Reads the `fields.identity` registry by string-literal id (no `fields/web`
 * import — the sanctioned read-by-id practice that keeps `data-view` free of an
 * import edge to `fields/web`).
 */
export function useFieldIdentities(): ReadonlyMap<string, FieldIdentity> {
  const ctx = useContext(PluginRuntimeContext);
  const raw = ctx?.bySlot.get("fields.identity");
  return useMemo(() => {
    const m = new Map<string, FieldIdentity>();
    for (const c of raw ?? []) {
      const identity = (c as { identity?: FieldIdentity }).identity;
      if (identity) m.set(identity.type.id, identity);
    }
    return m;
  }, [raw]);
}
