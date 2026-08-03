import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { Block, IdentifiedBlock } from "../core";

/**
 * Build a portable `IdentifiedBlock[]` for `rootIds` and their descendants from
 * the in-memory document rows (all blocks, incl. collapsed children). Children
 * are ordered by rank.
 *
 * THE forest serializer — copy and duplicate both go through it, which is what
 * makes "duplicate ≡ copy + paste-after-each-source" true rather than merely
 * intended. It used to have a server-side twin (`serializeSubtree`) that the
 * bespoke duplicate endpoint ran; that endpoint and that twin are both gone.
 *
 * It stamps each node's SOURCE row id — the markdown walk reads it (a `<page
 * id="…"/>` tag has no other source of identity), and both consumers overwrite
 * it immediately: `withMintedIds` mints fresh ids for a duplicate, and a paste
 * re-mints for the clipboard forest too. The id here is provenance, never a
 * destination identity.
 */
export function serializeForest(
  rows: readonly Block[],
  rootIds: readonly string[],
): IdentifiedBlock[] {
  const childrenOf = new Map<string | null, Block[]>();
  for (const r of rows) {
    const list = childrenOf.get(r.parentId);
    if (list) list.push(r);
    else childrenOf.set(r.parentId, [r]);
  }
  const byId = new Map(rows.map((r) => [r.id, r] as const));

  const build = (block: Block): IdentifiedBlock => {
    const children = (childrenOf.get(block.id) ?? [])
      .slice()
      .sort((a, b) => Rank.compare(a.rank, b.rank))
      .map(build);
    return {
      id: block.id,
      type: block.type,
      data: block.data,
      expanded: block.expanded,
      children,
    };
  };

  return rootIds
    .map((id) => byId.get(id))
    .filter((b): b is Block => b !== undefined)
    .map(build);
}
