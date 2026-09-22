// The zoomed editor's admission rule: an editor opened on ONE block (`rootId`)
// shows and edits that block and its descendants, and nothing a write does may
// reach outside that view.
//
// The store, the reducer and the endpoints still work on the FULL page — so the
// client's predicted forest stays the server's — and the view is a projection
// of it. That leaves one way for a zoomed gesture to go wrong: an op that is
// perfectly valid on the page (an outdent past the root, a drop before it, a
// wrap that reparents it) writes somewhere the user cannot see. The gesture
// layer maps what it can onto in-scope ops; this is the backstop that makes the
// rest refuse, at every structural write chokepoint, including op kinds added
// after it was written.
//
// Pure module (no React): unit-tested directly.

import { changedFields, type Block, type BlockNode } from "../../core";

/** `rootId` and every row below it in `rows`, by `parentId`. Empty when the root is absent. */
function subtreeIdsOf(
  rows: readonly Pick<Block, "id" | "parentId">[],
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  if (!rows.some((r) => r.id === rootId)) return out;
  const kids = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const list = kids.get(r.parentId) ?? [];
    list.push(r.id);
    kids.set(r.parentId, list);
  }
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const k of kids.get(id) ?? []) stack.push(k);
  }
  return out;
}

/**
 * Does the write `before → after` stay inside the zoom rooted at `rootId`?
 *
 * Refused when any of these is true:
 * - the root is absent on either side, or its `parentId` / `rank` changes (its
 *   type, data and fold are its own content, and may change);
 * - a row that was inside the subtree ends up outside it (moved out, or the
 *   subtree was cut from under it);
 * - a new row lands outside the subtree;
 * - a row outside the subtree is deleted, or changes in anything but
 *   `expanded`.
 *
 * `expanded` is the one outside field a write may touch, because the reducer
 * itself opens the collapsed containers around a split (`revealAround`) and the
 * destination parent of an insert — view state the user is not editing, whose
 * change reveals content on the full page and moves nothing. Refusing it would
 * refuse a plain Enter inside a zoomed block that happens to be the borrowed
 * line of a collapsed card.
 */
export function scopeAdmits(
  before: readonly Block[],
  after: readonly Block[],
  rootId: string,
): boolean {
  const rootBefore = before.find((b) => b.id === rootId);
  const rootAfter = after.find((b) => b.id === rootId);
  if (!rootBefore || !rootAfter) return false;
  if (
    rootBefore.parentId !== rootAfter.parentId ||
    String(rootBefore.rank) !== String(rootAfter.rank)
  )
    return false;

  const inBefore = subtreeIdsOf(before, rootId);
  const inAfter = subtreeIdsOf(after, rootId);
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterIds = new Set<string>();

  for (const a of after) {
    afterIds.add(a.id);
    const b = beforeById.get(a.id);
    if (!b || inBefore.has(a.id)) {
      // A new row, or one that was already in view: it must still be in view.
      if (!inAfter.has(a.id)) return false;
      continue;
    }
    // Outside the view before the write: untouched, save for its fold.
    const changed = Object.keys(changedFields(b, a));
    if (changed.some((field) => field !== "expanded")) return false;
  }
  for (const b of before) {
    if (!afterIds.has(b.id) && !inBefore.has(b.id)) return false;
  }
  return true;
}

/**
 * The keystroke resolver's view of a zoomed forest: the root and its
 * descendants only, with the root lifted to the top level (`parentId: null`).
 *
 * Every ladder then answers inside the view by construction — the root has no
 * previous line to merge into, no sibling to indent under, and the last line has
 * no next one to pull up — so no rung has to know it is zoomed except the two
 * that ask where the top level IS (`IntentContext.scopeRootId`).
 */
export function scopeNodes(nodes: BlockNode[], rootId: string): BlockNode[] {
  const ids = subtreeIdsOf(nodes, rootId);
  return nodes
    .filter((n) => ids.has(n.id))
    .map((n) => (n.id === rootId ? { ...n, parentId: null } : n));
}
