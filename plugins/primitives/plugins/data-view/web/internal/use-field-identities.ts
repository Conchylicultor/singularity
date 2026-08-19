import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldIdentity } from "@plugins/fields/core";
import { Fields } from "@plugins/fields/web";

/**
 * Reads the `fields.identity` registry off the slot OBJECT. The raw `bySlot`
 * read (rather than `useContributions()`) is what keeps the identity payload
 * unsealed; naming the slot by identity is what keeps a typo from silently
 * resolving to an empty registry. The `fields/web` edge it costs is real and
 * acyclic — `fields/web` imports nothing from `data-view`.
 */
export function useFieldIdentities(): ReadonlyMap<string, FieldIdentity> {
  const ctx = useContext(PluginRuntimeContext);
  const raw = ctx?.bySlot.get(Fields.Identity);
  return useMemo(() => {
    const m = new Map<string, FieldIdentity>();
    for (const c of raw ?? []) {
      const identity = (c as { identity?: FieldIdentity }).identity;
      if (identity) m.set(identity.type.id, identity);
    }
    return m;
  }, [raw]);
}
