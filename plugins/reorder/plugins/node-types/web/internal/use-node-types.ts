import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { ReorderNodeType } from "@plugins/reorder/plugins/node-types/core";

/**
 * Reads the `reorder.node-type` registry by string-literal id, keyed by
 * `nodeType.type`. Mirrors `useFieldIdentities` — the sanctioned raw `bySlot`
 * read that keeps the registry barrel free of a back-edge to its readers.
 */
export function useReorderNodeTypes(): Map<string, ReorderNodeType> {
  const ctx = useContext(PluginRuntimeContext);
  const raw = ctx?.bySlot.get("reorder.node-type");
  return useMemo(() => {
    const m = new Map<string, ReorderNodeType>();
    for (const c of raw ?? []) {
      const nodeType = (c as { nodeType?: ReorderNodeType }).nodeType;
      if (nodeType) m.set(nodeType.type, nodeType);
    }
    return m;
  }, [raw]);
}
