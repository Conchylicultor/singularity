import { defineConfig } from "@plugins/config_v2/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import {
  reorderTreeField,
  type ReorderTreeFieldDef,
} from "@plugins/fields/plugins/reorder-tree/plugins/config/core";

/**
 * A reorder layout governs the top-level order and visibility of a single render
 * slot's contributions. It is a single `items` field — a `ReorderTree` (recursive
 * tagged-node tree) applied over the *live* catalog at render time (see
 * `web/internal/sorting.ts`):
 *
 * - A node names a contribution by `entryKey` (bare string → `{ item }`).
 * - `{ item, hidden: true }` removes that contribution from the slot (never hides
 *   `excludeFromReorder` items).
 * - `{ spacer: <id> }` materializes a blank draggable gap at its position.
 * - `{ group, items }` is reserved for a future groups migration — the editor
 *   never emits/parses it yet and `applyTree` ignores it (groups stay DB-backed).
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
    promotableToGit: true,
    fields: {
      items: reorderTreeField({ label: "Items" }),
    },
  });
}
