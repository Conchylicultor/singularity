import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { isNodeData, type TopLevelEntry } from "@plugins/reorder/web";
import type { BlockHandle } from "../../core";

/**
 * A group of insertable block types the menus render together. A `label`-less
 * section is an unlabeled run (rendered with no eyebrow); a labeled section is a
 * `header` container from the reorder config tree.
 */
export interface BlockSection {
  label?: string;
  blocks: BlockHandle<unknown>[];
}

/** Read the `block` handle carried by an `Editor.Block` contribution entry. */
function blockOf(
  entry: Contribution | TopLevelEntry,
): BlockHandle<unknown> | undefined {
  if (isNodeData(entry)) return undefined;
  return (entry as { block?: BlockHandle<unknown> }).block;
}

/**
 * PURE transform: reorder `entries` (the `page.editor.block` slot's config tree
 * applied over the live contributions) → the grouped `BlockSection[]` the menus
 * render. Group-blind by design — the groups live only in the config file:
 *
 * - a `header` node becomes a labeled section (its `payload.label`), its members
 *   resolved to block handles;
 * - a run of loose top-level items becomes a label-less section (so the flat
 *   default config — no headers — yields today's single unlabeled list);
 * - spacer / unknown node types are ignored (menus draw no gaps);
 * - a block is KEPT only if it declares a menu `label` AND passes the
 *   `enabled` allowlist (the in-memory demo's curated palette); and
 * - an emptied section (all members filtered out) is dropped.
 */
export function entriesToSections(
  entries: TopLevelEntry[],
  enabled: readonly string[] | undefined,
): BlockSection[] {
  const keep = (b: BlockHandle<unknown>): boolean =>
    !!b.label && (!enabled || enabled.includes(b.type));

  const sections: BlockSection[] = [];
  let loose: BlockHandle<unknown>[] = [];

  const flushLoose = () => {
    if (loose.length > 0) sections.push({ blocks: loose });
    loose = [];
  };

  for (const entry of entries) {
    if (isNodeData(entry)) {
      if (entry.type !== "header") continue; // spacer / unknown → ignored
      flushLoose();
      const label =
        typeof entry.payload.label === "string" ? entry.payload.label : undefined;
      const blocks = (entry.members ?? [])
        .map(blockOf)
        .filter((b): b is BlockHandle<unknown> => !!b && keep(b));
      if (blocks.length > 0) sections.push({ label, blocks });
      continue;
    }
    const b = blockOf(entry);
    if (b && keep(b)) loose.push(b);
  }
  flushLoose();

  return sections;
}

/** Flatten grouped sections back to the plain block list (config order preserved). */
export function flattenSections(
  sections: BlockSection[],
): BlockHandle<unknown>[] {
  return sections.flatMap((s) => s.blocks);
}
