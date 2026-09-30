// Content-free blocks an edit has no say over.
//
// A policy that judges a plan (`ApplyBlockOptions.assertAcceptable`) can only
// REFUSE a write. Some writes are not worth refusing and not safe to make
// either: an empty paragraph a caller adds, or leaves out, in a region it may
// not write. Refusing the whole edit over a spacer costs the caller a round trip
// and buys nothing; letting it through changes a region that is not the
// caller's. The third answer is to not make the write at all — to treat those
// blocks as absent from BOTH sides of the diff, the way `redact` treats a hidden
// card:
//
// - a stored inert row is pruned from the planner's WALK, so it is never
//   matched, moved or deleted, and still holds its `(parent_id, rank)` key as a
//   rank obstacle (`plan.ts`'s reserved ranks) — nothing is minted onto it;
// - an inert node of the incoming document is dropped before planning, so it
//   is never created and never paired with a stored row.
//
// Dropping both sides is what makes this exact rather than a guess: an inert
// line the caller copied from its read, one it added and one it left out all
// plan the same — as nothing. What stays in the document is planned exactly as
// it would have been without them.
//
// The engine never learns WHICH blocks are inert, for `redact`'s reason: the
// predicate is the caller's, and this module names no block type.
//
// **Leaves only.** Dropping a node drops its subtree, and pruning a row prunes
// its subtree from the walk — so an inert block with children would silently
// take real content with it (a dropped subtree the caller wrote, or stored
// children re-created as duplicates). Both halves throw on one instead.

import type { SerializedBlock } from "@plugins/page/plugins/editor/core";
import type { StoredRow } from "./stored-row";

/** Which blocks, on either side of one apply, the edit has no say over. */
export interface InertBlocks<R extends StoredRow = StoredRow> {
  /** A stored row. Must be a leaf (asserted). */
  row(row: R): boolean;
  /**
   * A node of the incoming document, with its ancestors IN THAT DOCUMENT,
   * nearest first — whatever sits above the document's top level (the scope
   * root and its chain) is the caller's to know. Must be a leaf (asserted).
   */
  node(node: SerializedBlock, ancestors: readonly SerializedBlock[]): boolean;
}

/**
 * `forest` with every inert node removed, and how many were.
 *
 * Top-down, so a node's ancestors are exactly what the caller's document holds
 * above it — a node is never judged under a parent this pass has already
 * dropped (it cannot have one: an inert node is a leaf).
 */
export function dropInertNodes(
  forest: readonly SerializedBlock[],
  isInert: InertBlocks["node"],
): { forest: SerializedBlock[]; dropped: number } {
  let dropped = 0;
  const walk = (
    nodes: readonly SerializedBlock[],
    ancestors: readonly SerializedBlock[],
  ): SerializedBlock[] => {
    const out: SerializedBlock[] = [];
    for (const node of nodes) {
      if (isInert(node, ancestors)) {
        if (node.children.length > 0) {
          throw new Error(
            `dropInertNodes: an inert ${node.type} node has ${node.children.length} ` +
              "children. Only a leaf can be inert — dropping this one would drop " +
              "content the document holds.",
          );
        }
        dropped += 1;
        continue;
      }
      out.push({
        ...node,
        children: walk(node.children, [node, ...ancestors]),
      });
    }
    return out;
  };
  return { forest: walk(forest, []), dropped };
}

/**
 * `rows` without the inert ones — the filter to compose AFTER a caller's
 * `redact`, so the planner's walk never reaches them.
 */
export function dropInertRows<R extends StoredRow>(
  rows: readonly R[],
  isInert: InertBlocks<R>["row"],
): R[] {
  const parents = new Set<string>();
  for (const row of rows) if (row.parentId !== null) parents.add(row.parentId);
  return rows.filter((row) => {
    if (!isInert(row)) return true;
    if (parents.has(row.id)) {
      throw new Error(
        `dropInertRows: inert row ${row.id} (${row.type}) has children. Only a ` +
          "leaf can be inert — pruning this one would hide its children from the " +
          "walk, and a document still holding them would re-create them.",
      );
    }
    return false;
  });
}
