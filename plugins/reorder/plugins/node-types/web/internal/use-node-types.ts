import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { ReorderNodeType } from "@plugins/reorder/plugins/node-types/core";
import { ReorderNodes } from "../slots";

/**
 * Reads the `reorder.node-type` registry off the slot OBJECT, keyed by
 * `nodeType.type`. Mirrors `useFieldIdentities` — a raw `bySlot` read (rather
 * than `useContributions()`) so the node-type payload stays unsealed.
 */
export function useReorderNodeTypes(): Map<string, ReorderNodeType> {
  const ctx = useContext(PluginRuntimeContext);
  const raw = ctx?.bySlot.get(ReorderNodes.NodeType);
  return useMemo(() => {
    const m = new Map<string, ReorderNodeType>();
    for (const c of raw ?? []) {
      const nodeType = (c as { nodeType?: ReorderNodeType }).nodeType;
      if (nodeType) m.set(nodeType.type, nodeType);
    }
    return m;
  }, [raw]);
}
