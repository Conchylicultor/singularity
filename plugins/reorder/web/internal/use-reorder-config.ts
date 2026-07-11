import { useMemo } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";

/**
 * Read a reorderable slot's `items` tree from its config_v2 descriptor.
 *
 * The SINGLE definition of how reorder projects its config into a `ReorderTree`,
 * shared by the two consumers that must never disagree: the list middleware
 * (`useReorderConfig`, which also needs the writer) and the data-level read hook
 * (`useReorderedEntries`). `useConfig` on a generically-typed descriptor returns
 * a loose record; read the single `items` field as a possibly-missing tree.
 */
export function useReorderTree(descriptor: ConfigDescriptor): ReorderTree {
  const cfg = useConfig(descriptor) as unknown as { items?: ReorderTree };
  return useMemo<ReorderTree>(() => cfg.items ?? [], [cfg.items]);
}

/**
 * The row-invariant `{ items, setConfig }` a reorderable slot needs from its
 * single config subscription: its `items` tree and the `setConfig` writer.
 */
export interface ReorderHoistedConfig {
  items: ReorderTree;
  setConfig: (key: string, value: unknown) => void;
}

/**
 * Reads a reorderable slot's `items` tree + `setConfig` writer. This is the
 * ONLY live-state subscription the reorder middleware makes (`config-v2.values`),
 * once per render site.
 */
export function useReorderConfig(
  descriptor: ConfigDescriptor,
): ReorderHoistedConfig {
  const items = useReorderTree(descriptor);
  const setConfig = useSetConfig(descriptor);
  return useMemo(() => ({ items, setConfig }), [items, setConfig]);
}
