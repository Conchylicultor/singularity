import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { Block, SerializedBlock } from "../core";

/**
 * Build a portable `SerializedBlock[]` for `rootIds` and their descendants from
 * the in-memory document rows (all blocks, incl. collapsed children). Children
 * are ordered by rank. Mirrors the server's `serializeSubtree` so copy (client)
 * and duplicate (server) produce the same shape.
 */
export function serializeForest(
  rows: readonly Block[],
  rootIds: readonly string[],
): SerializedBlock[] {
  const childrenOf = new Map<string | null, Block[]>();
  for (const r of rows) {
    const list = childrenOf.get(r.parentId);
    if (list) list.push(r);
    else childrenOf.set(r.parentId, [r]);
  }
  const byId = new Map(rows.map((r) => [r.id, r] as const));

  const build = (block: Block): SerializedBlock => {
    const children = (childrenOf.get(block.id) ?? [])
      .slice()
      .sort((a, b) => Rank.compare(a.rank, b.rank))
      .map(build);
    return { type: block.type, data: block.data, expanded: block.expanded, children };
  };

  return rootIds
    .map((id) => byId.get(id))
    .filter((b): b is Block => b !== undefined)
    .map(build);
}
