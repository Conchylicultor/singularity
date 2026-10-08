import type { RollupReconcile } from "@plugins/database/plugins/derived-tables/core";

// What this boot's committed schema layer did to each rollup (A20). Published
// by the database plugin AFTER `applySchemaLayer` commits — never written from
// inside the layer, which also runs as a rolled-back dry run and in the
// schema-layer replay suite, where a heal it reported would never have
// happened (C13).
let published: readonly RollupReconcile[] | undefined;

/** Record the committed schema layer's reconcile result (the database plugin, once per boot). */
export function publishReconciledRollups(
  rollups: readonly RollupReconcile[],
): void {
  published = rollups;
}

/**
 * The committed boot reconcile, per rollup: rows it healed and whether its
 * definition was (re)installed. Throws before the schema layer committed —
 * a reader that runs before it is a boot-ordering bug (A20: the reconcile
 * completes before live-state-snapshot's onReady).
 */
export function reconciledRollups(): readonly RollupReconcile[] {
  if (published === undefined) {
    throw new Error(
      "reconciledRollups(): the boot schema layer has not committed yet — read it only after the database plugin's onReadyBlocking (depend on @plugins/database/server).",
    );
  }
  return published;
}
