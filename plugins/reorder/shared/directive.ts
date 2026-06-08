import { defineConfig } from "@plugins/config_v2/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import {
  stringListField,
  type StringListFieldDef,
} from "@plugins/fields/plugins/string-list/plugins/config/core";

/**
 * A reorder directive governs the top-level order and visibility of a single
 * render slot's contributions. It is applied over the *live* catalog at render
 * time (see `web/internal/sorting.ts`):
 *
 * - `order`: `entryKey[]` listed first, in this exact order. Unmentioned
 *   contributions keep their natural runtime order and are appended after.
 * - `hidden`: `entryKey[]` to remove from the slot (never hides
 *   `excludeFromReorder` items).
 *
 * `entryKey` is the stable reorder key — `${pluginId}:${id}` when a contribution
 * carries a `_pluginId`, else the bare `id`. This is the same key
 * `entryKey()`/`contributionKey()` compute in `web/internal/sorting.ts` and the
 * one the build-time catalog lists in the generated origin comments.
 */
export interface ReorderDirective {
  order: string[];
  hidden: string[];
}

/**
 * Build the config_v2 descriptor for a slot's reorder directive. Each
 * reorderable slot gets exactly one descriptor with an identical schema.
 *
 * Isomorphic — this module is imported by BOTH `reorder/web` and
 * `reorder/server`, so it may only depend on `core` barrels. `useConfig`
 * matches descriptors by reference identity, so each runtime must build the
 * descriptor once (via the shared per-runtime map modules) and reuse that
 * instance for both registration and reads.
 */
export function reorderDirectiveDescriptor(
  slotId: string,
): ConfigDescriptor<{ order: StringListFieldDef; hidden: StringListFieldDef }> {
  return defineConfig({
    name: slotId,
    fields: {
      order: stringListField({ label: "Order", default: [] }),
      hidden: stringListField({ label: "Hidden", default: [] }),
    },
  });
}
