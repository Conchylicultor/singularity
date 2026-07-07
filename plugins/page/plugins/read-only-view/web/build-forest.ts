import type { ReadOnlyNode } from "./node";

/**
 * The minimal structural fields `buildForest` reads off a stored block. Both
 * consumers — the version-history snapshot rows (`StoredBlock`, which also carry
 * `rank`) and the live editor `Block` (which carries `pageId`/timestamps) — are
 * structurally assignable, so the builder is generic over this shape and neither
 * caller needs a cast. Sibling order comes from the input order (rows arrive
 * rank-ordered from the server); `rank` itself is not read here.
 */
export interface ForestBlock {
  id: string;
  parentId: string | null;
  type: string;
  /** Optional to match the live editor `Block` (its jsonb column is `data?`). */
  data?: unknown;
  expanded: boolean;
}

/**
 * Build a `ReadOnlyNode[]` forest from flat stored rows. Top-level content
 * blocks are parented to the page id; siblings stay in input order. Each node
 * keeps its stable `id` so the renderer can look it up in a diff map (when one
 * is supplied). Pure — no editor providers, no Lexical.
 */
export function buildForest<B extends ForestBlock>(
  blocks: B[],
  pageId: string,
): ReadOnlyNode[] {
  const childrenByParent = new Map<string | null, B[]>();
  for (const b of blocks) {
    const list = childrenByParent.get(b.parentId);
    if (list) list.push(b);
    else childrenByParent.set(b.parentId, [b]);
  }
  const build = (parentId: string | null): ReadOnlyNode[] =>
    (childrenByParent.get(parentId) ?? []).map((b) => ({
      id: b.id,
      type: b.type,
      data: b.data,
      expanded: b.expanded,
      children: build(b.id),
    }));
  return build(pageId);
}
