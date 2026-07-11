import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { BlockHandle } from "../../core";

// Server-reachable `type → handle` registry. `Editor.Block` is a WEB-only dispatch
// slot, so nothing on the server could resolve a block type's `data` schema; each
// block-type plugin contributes its handle here so the write boundary can validate.
//
// No eager self-registering index (unlike `fields`'s `Fields.Storage`): that mirror
// exists only because `resolveFieldStorage` runs at module-eval inside `defineEntity`,
// BEFORE `collectContributions`. Block validation runs at REQUEST time, long after the
// boot-time collect pass has populated the live registry — so the plain token suffices.
// Do not "restore" an eager map.
export const Editor = {
  /** Per-type `data` schema. Contribute the block handle; keyed by `type`. */
  BlockData: defineServerContribution<BlockHandle<unknown>>("page.block-data", {
    docLabel: (h) => h.type,
  }),
};

/**
 * Resolve the block handle for a `type`, or `undefined` if no plugin contributed one.
 * Two plugins claiming one `type` is a defect (last-write-wins would silently mask a
 * schema collision), so a duplicate registration throws loudly, naming the offenders.
 */
export function resolveBlockHandle(
  type: string,
): BlockHandle<unknown> | undefined {
  const matches = Editor.BlockData.getContributions().filter(
    (h) => h.type === type,
  );
  if (matches.length > 1) {
    const owners = matches.map((h) => h._pluginId ?? "<unknown>").join(", ");
    throw new Error(
      `Duplicate Editor.BlockData registration for block type "${type}" from: ${owners}. ` +
        `A block type's data schema must be owned by exactly one plugin.`,
    );
  }
  return matches[0];
}
