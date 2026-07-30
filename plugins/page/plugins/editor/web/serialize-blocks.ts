import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { Block, SerializedBlock } from "../core";

/**
 * Build a portable `SerializedBlock[]` for `rootIds` and their descendants from
 * the in-memory document rows (all blocks, incl. collapsed children). Children
 * are ordered by rank.
 *
 * THE forest serializer — copy and duplicate both go through it, which is what
 * makes "duplicate ≡ copy + paste-after-each-source" true rather than merely
 * intended. It used to have a server-side twin (`serializeSubtree`) that the
 * bespoke duplicate endpoint ran; that endpoint and that twin are both gone.
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
