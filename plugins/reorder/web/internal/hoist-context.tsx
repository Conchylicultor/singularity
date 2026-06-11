import { createContext } from "react";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";

/**
 * The row-invariant config a reorderable slot needs: its `items` tree and the
 * `setConfig` writer. Both come from ONE `useConfig`/`useSetConfig` pair (the
 * only live-state subscription the reorder middleware makes — `config-v2.values`
 * + `config-v2.scope-forked`). Published by `<ReorderHoist>` so every
 * `<Slot.Render>` underneath shares it instead of subscribing per render site.
 *
 * Everything else (the live catalog via `applyTree`, the drag/hide/insert
 * handlers, the rendered nodes) is derived per render site from the host's own
 * `contributions` + `renderItem` — cheap, no subscription.
 */
export interface ReorderHoistedConfig {
  items: ReorderTree;
  setConfig: (key: string, value: unknown) => void;
}

/**
 * Keyed by `slotId` so a viewer can hoist several slots / nest providers. The
 * list middleware reads its own `slotId`: present → use the shared config with
 * no subscription; absent → fall back to the legacy self-subscribing path.
 */
export const ReorderHoistContext = createContext<
  Map<string, ReorderHoistedConfig> | null
>(null);
