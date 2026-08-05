import { defineConfig } from "@plugins/config_v2/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import {
  reorderTreeField,
  type ReorderTreeFieldDef,
} from "@plugins/fields/plugins/reorder-tree/plugins/config/core";
import { REORDER_NODE_LEGEND } from "@plugins/fields/plugins/reorder-tree/core";

/**
 * A reorder layout governs the top-level order and visibility of a single render
 * slot's contributions. It is a single `items` field — a `ReorderTree` (recursive
 * tagged-node tree) applied over the *live* catalog at render time (see
 * `web/internal/sorting.ts`):
 *
 * - A node names a contribution by `entryKey` (bare string → `{ item }`).
 * - `{ item, hidden: true }` removes that contribution from the slot (never hides
 *   `excludeFromReorder` items).
 * - `{ type, id?, items? }` is any registered node type — see
 *   `REORDER_NODE_LEGEND` for the authoring forms, and `reorder/node-types` for
 *   the registry. An unknown `type` is skipped at render (fail-soft).
 * - Any live, visible contribution NOT named in the tree is appended in natural
 *   order (fail-loud — a contribution is never silently dropped).
 *
 * Unlike the old drift-tolerant directive, the generated origin materializes the
 * **full current catalog** as the default, so adding/removing a contribution
 * shifts the origin hash → committed overrides go stale and `config-origins-in-sync`
 * blocks push until reconciled.
 *
 * `entryKey` is the stable reorder key — `${pluginId}:${id}` when a contribution
 * carries a `_pluginId`, else the bare `id`. This is the same key
 * `entryKey()`/`contributionKey()` compute in `web/internal/sorting.ts` and the
 * one the build-time catalog materializes into the generated origin default.
 */

/**
 * Build the config_v2 descriptor for a slot's reorder layout. Each reorderable
 * slot gets exactly one descriptor with an identical schema.
 *
 * Isomorphic — this module is imported by BOTH `reorder/web` and
 * `reorder/server`, so it may only depend on `core` barrels. `useConfig`
 * matches descriptors by reference identity, so each runtime must build the
 * descriptor once (via the shared per-runtime map modules) and reuse that
 * instance for both registration and reads.
 */
export function reorderDirectiveDescriptor(
  slotId: string,
): ConfigDescriptor<{ items: ReorderTreeFieldDef }> {
  return defineConfig({
    name: slotId,
    source: "reorder",
    // A slot's on-screen order must be a deliberate, committed layout — never
    // the natural order contributions happen to load in. `./singularity build`
    // seeds the override (and re-marks it when the catalog shifts underneath);
    // these lines ride along as the file's own comments, and are the whole of
    // what `config:overrides-authored` echoes back. They are read by a human at
    // the moment of arranging, so keep them short and imperative.
    requiresAuthoredOverride: {
      guidance: [
        'Arrange "items" for how this slot ACTUALLY renders — a sidebar is a',
        "vertical list, a toolbar a horizontal bar, a pane a stack of blocks.",
        "Look at the surface, then order for that reading direction.",
        "Node forms:",
        // ONE legend, shared with the generated origin comments — a hand-copied
        // second list is how this one silently went stale (it never learned
        // about the `header` container).
        ...REORDER_NODE_LEGEND,
        "At most one spacer per slot.",
      ],
    },
    fields: {
      items: reorderTreeField({ label: "Items" }),
    },
  });
}
