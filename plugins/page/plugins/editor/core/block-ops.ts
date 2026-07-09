import { z } from "zod";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { isDescendant, subtreeIds } from "@plugins/primitives/plugins/tree/core";
import { PAGE_BLOCK_TYPE } from "./schemas";
import {
  mergeRuns,
  plainOf,
  runsOf as coerceRuns,
  splitRuns,
  TextRunSchema,
  type RichText,
} from "./rich-text";

/**
 * JSON-pure subset of a block row used by the reducer. `createdAt`/`updatedAt`
 * stay out of the reducer — the server stamps those during reconcile. `rank` is
 * the stored string form (wrap with `Rank.from` to do math, serialize back with
 * `.toJSON()`).
 */
export type BlockNode = {
  id: string;
  pageId: string | null;
  parentId: string | null;
  type: string;
  data: unknown;
  rank: string;
  expanded: boolean;
};

/**
 * The complete set of single-block, in-page tree operations. New blocks carry a
 * client-minted `newId` so client and server compute byte-identical results.
 * Caret/focus is intentionally NOT part of the reducer.
 */
export type BlockOp =
  | {
      kind: "split";
      blockId: string;
      position: number;
      newId: string;
      asChild?: boolean;
      childType?: string;
      /**
       * Sibling block type produced by a non-asChild split at the end of the
       * block's text (e.g. a heading yields a `text` paragraph). Defaults to the
       * original block's type.
       */
      siblingType?: string;
      /**
       * Authoritative current rich-text runs from the editor; falls back to the
       * stored block runs (`runsOfNode`) when absent. Lets the reducer split the
       * live (doc-fresh, projection may lag ~1s) content rather than the lagged
       * projection. The LIVE split path ALWAYS sets this; the fallback is reached
       * only by the pure reducer (tests / non-live callers), for whom `data.text`
       * IS the intended basis — so the fallback must stay.
       */
      runs?: RichText;
    }
  | {
      kind: "merge";
      blockId: string;
      /**
       * Authoritative current rich-text runs of the merging block from the
       * editor; falls back to the stored block runs (`runsOfNode`) when absent.
       * Same seam as split: LIVE merge always supplies this, the fallback is the
       * pure reducer's projection basis — do not remove it.
       */
      runs?: RichText;
    } // merge into prev sibling
  | { kind: "indent"; blockId: string }
  | { kind: "outdent"; blockId: string }
  | {
      kind: "insert";
      newId: string;
      type: string;
      data?: unknown;
      // Placement, in precedence order: after a sibling, before a sibling, or
      // appended as the last child of `parentId`. `afterId`/`beforeId` both
      // inherit the named sibling's parent.
      afterId?: string | null;
      beforeId?: string | null;
      parentId?: string | null;
    }
  | { kind: "delete"; blockId: string }
  | { kind: "move"; blockId: string; parentId: string | null; rank: string };

/**
 * Zod discriminated union mirroring `BlockOp`, for server body validation. The
 * explicit `z.ZodType<BlockOp>` annotation pins the inferred output to the full
 * union — without it, `defineEndpoint`'s `SpecType<B>` extraction collapses a
 * discriminated union to its last member.
 */
export const BlockOpSchema: z.ZodType<BlockOp> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("split"),
    blockId: z.string(),
    position: z.number().int().nonnegative(),
    newId: z.string(),
    asChild: z.boolean().optional(),
    childType: z.string().optional(),
    siblingType: z.string().optional(),
    runs: z.array(TextRunSchema).optional(),
  }),
  z.object({ kind: z.literal("merge"), blockId: z.string(), runs: z.array(TextRunSchema).optional() }),
  z.object({ kind: z.literal("indent"), blockId: z.string() }),
  z.object({ kind: z.literal("outdent"), blockId: z.string() }),
  z.object({
    kind: z.literal("insert"),
    newId: z.string(),
    type: z.string(),
    data: z.unknown().optional(),
    afterId: z.string().nullable().optional(),
    beforeId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
  }),
  z.object({ kind: z.literal("delete"), blockId: z.string() }),
  z.object({
    kind: z.literal("move"),
    blockId: z.string(),
    parentId: z.string().nullable(),
    rank: z.string(),
  }),
]);

// ---------------------------------------------------------------------------
// Pure helpers — the single source of rank/tree math.
// ---------------------------------------------------------------------------

/** Children of `parentId`, sorted ascending by rank. */
export function childrenOf(blocks: BlockNode[], parentId: string | null): BlockNode[] {
  return blocks
    .filter((b) => b.parentId === parentId)
    .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)));
}

/** The rank-immediate previous sibling of `node` (null if it is first). */
export function prevSibling(blocks: BlockNode[], node: BlockNode): BlockNode | null {
  const siblings = childrenOf(blocks, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  if (idx <= 0) return null;
  return siblings[idx - 1] ?? null;
}

/**
 * The previous block in VISIBLE document order: the deepest last expanded
 * descendant of `node`'s previous sibling. Null if there is no previous sibling.
 * Stops descending at a collapsed block (its children aren't visible), so the
 * leaf is exactly the block whose end the caret would land at when crossing up.
 */
export function prevVisibleLeaf(blocks: BlockNode[], node: BlockNode): BlockNode | null {
  let cur = prevSibling(blocks, node);
  if (!cur) return null;
  while (cur.expanded) {
    const kids = childrenOf(blocks, cur.id);
    if (kids.length === 0) break;
    cur = kids[kids.length - 1]!;
  }
  return cur;
}

/** The rank-immediate next sibling of `node` (null if it is last). */
export function nextSibling(blocks: BlockNode[], node: BlockNode): BlockNode | null {
  const siblings = childrenOf(blocks, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  if (idx === -1) return null;
  return siblings[idx + 1] ?? null;
}

/** Look up a block by id (undefined if absent). */
export function byId(blocks: BlockNode[], id: string): BlockNode | undefined {
  return blocks.find((b) => b.id === id);
}

/** Last element of `arr`, or null when empty (avoids `Array.prototype.at`). */
function lastOf<T>(arr: readonly T[]): T | null {
  return arr.length > 0 ? arr[arr.length - 1]! : null;
}

/** Coerce a block's jsonb payload (typed `unknown`) into a plain object. */
function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The block's text payload flattened to a plain string, or "" when it has none.
 * Reads `data.text` (which may be a legacy string or structured runs) through the
 * rich-text normalizer. Used where a plain title/preview is needed (e.g.
 * turn-into-page) — structural ops use `runsOfNode`/`withRuns`.
 */
export function textOf(node: { data?: unknown }): string {
  return plainOf(asObject(node.data).text);
}

/**
 * The block's text payload as structured rich-text runs (coerced; `[]` when none).
 *
 * Reads `data.text`, the debounced projection of the live content doc — it lags
 * the doc by up to ~1s. That lag is by design here: this is only the reducer's
 * FALLBACK basis (`op.runs ?? runsOfNode(...)` at the split/merge seams). Every
 * LIVE caller supplies `op.runs` (authoritative current runs from the bound
 * editor), so the projection is never used on the live path; reducer-only / test
 * callers, which operate from row data alone, accept the projection basis by
 * construction.
 */
export function runsOfNode(node: { data?: unknown }): RichText {
  return coerceRuns(asObject(node.data).text);
}

/** A copy of `node` with `data.text` set to `runs` (spreads existing data). */
export function withRuns(node: BlockNode, runs: RichText): BlockNode {
  return { ...node, data: { ...asObject(node.data), text: runs } };
}

/** Immutable replace: return a new array with the node of `next.id` swapped. */
export function replace(blocks: BlockNode[], next: BlockNode): BlockNode[] {
  return blocks.map((b) => (b.id === next.id ? next : b));
}

/** Immutable remove: return a new array without the given ids. */
export function remove(blocks: BlockNode[], ids: ReadonlySet<string> | string[]): BlockNode[] {
  const set = ids instanceof Set ? ids : new Set(ids);
  return blocks.filter((b) => !set.has(b.id));
}

/** Immutable add: return a new array with `node` appended. */
export function add(blocks: BlockNode[], node: BlockNode): BlockNode[] {
  return [...blocks, node];
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Apply a single block op to the full in-memory page block list, purely. Never
 * mutates `blocks` (returns a new array with new node objects for changed
 * nodes), and never changes a surviving node's `pageId` (in-page invariant).
 */
export function applyBlockOp(blocks: BlockNode[], op: BlockOp): BlockNode[] {
  switch (op.kind) {
    case "split":
      return applySplit(blocks, op);
    case "merge":
      return applyMerge(blocks, op);
    case "indent":
      return applyIndent(blocks, op);
    case "outdent":
      return applyOutdent(blocks, op);
    case "insert":
      return applyInsert(blocks, op);
    case "delete":
      return applyDelete(blocks, op);
    case "move":
      return applyMove(blocks, op);
  }
}

function applySplit(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "split" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;

  // Live callers pass authoritative `op.runs`; the `runsOfNode` fallback (lagged
  // `data.text` projection) is the pure reducer's basis (tests / non-live).
  const runs = op.runs ?? runsOfNode(block);
  const [beforeRuns, afterRuns] = splitRuns(runs, op.position);

  let next = blocks;
  let updatedBlock = withRuns(block, beforeRuns);

  let newParentId: string | null;
  let newType: string;
  let newRank: Rank;
  if (op.asChild) {
    // Nest the split-off content as the original's FIRST child, before any
    // existing child, and force the original open so the new child is visible.
    const firstChild = childrenOf(blocks, block.id)[0] ?? null;
    const firstChildRank = firstChild ? Rank.from(firstChild.rank) : null;
    newParentId = block.id;
    newType = op.childType ?? block.type;
    newRank = Rank.between(null, firstChildRank);
    updatedBlock = { ...updatedBlock, expanded: true };
  } else {
    const next0 = nextSibling(blocks, block);
    newParentId = block.parentId;
    newType = op.siblingType ?? block.type;
    newRank = Rank.between(Rank.from(block.rank), next0 ? Rank.from(next0.rank) : null);
  }

  next = replace(next, updatedBlock);

  const newData = { ...asObject(block.data), text: afterRuns };
  const newNode: BlockNode = {
    id: op.newId,
    pageId: block.pageId,
    parentId: newParentId,
    type: newType,
    data: newData,
    rank: newRank.toJSON(),
    expanded: false,
  };
  return add(next, newNode);
}

function applyMerge(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "merge" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  // Merge into the previous VISIBLE block (the deepest last expanded descendant
  // of the prev sibling), not the immediate sibling — so the caret lands where
  // the text visually joins, matching document order.
  const prev = prevVisibleLeaf(blocks, block);
  if (!prev) return blocks; // no-op

  // Concatenate runs into prev (coalescing the seam). `op.runs` is the live
  // merging runs on the live path; `runsOfNode` (lagged projection) is only the
  // pure reducer's fallback basis (tests / non-live).
  let mergedPrev = withRuns(prev, mergeRuns(runsOfNode(prev), op.runs ?? runsOfNode(block)));

  // Adopt the block's children under prev, appended after prev's existing
  // children, order-preserving.
  const adopted = childrenOf(blocks, block.id);
  const existingPrevKids = childrenOf(blocks, prev.id);
  const lastPrevKid = lastOf(existingPrevKids);
  const adoptedRanks = Rank.nBetween(
    lastPrevKid ? Rank.from(lastPrevKid.rank) : null,
    null,
    adopted.length,
  );
  if (adopted.length > 0) {
    mergedPrev = { ...mergedPrev, expanded: true };
  }

  let next = replace(blocks, mergedPrev);
  adopted.forEach((child, i) => {
    next = replace(next, { ...child, parentId: prev.id, rank: adoptedRanks[i]!.toJSON() });
  });

  return remove(next, [block.id]);
}

function applyIndent(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "indent" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  const prev = prevSibling(blocks, block);
  if (!prev) return blocks; // no-op

  const lastChild = lastOf(childrenOf(blocks, prev.id));
  const newRank = Rank.between(lastChild ? Rank.from(lastChild.rank) : null, null);

  let next = replace(blocks, { ...block, parentId: prev.id, rank: newRank.toJSON() });
  next = replace(next, { ...prev, expanded: true });
  return next;
}

function applyOutdent(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "outdent" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  if (!block.parentId) return blocks; // already at top level

  const parent = byId(blocks, block.parentId);
  if (!parent) return blocks;
  // Content's top level is "directly under the page"; outdenting past that would
  // escape the page — disallow.
  if (parent.type === PAGE_BLOCK_TYPE) return blocks;

  // Capture followers + the block's existing children from the PRE-move array,
  // before mutating anything.
  const blockRank = Rank.from(block.rank);
  const followers = childrenOf(blocks, parent.id).filter(
    (s) => Rank.compare(Rank.from(s.rank), blockRank) > 0,
  );
  const existingKids = childrenOf(blocks, block.id);

  // Block becomes the sibling immediately after `parent`, reparented to the
  // grandparent.
  const parentNext = nextSibling(blocks, parent);
  const newRank = Rank.between(
    Rank.from(parent.rank),
    parentNext ? Rank.from(parentNext.rank) : null,
  );
  let movedBlock: BlockNode = {
    ...block,
    parentId: parent.parentId,
    rank: newRank.toJSON(),
  };

  // Reparent the following siblings as children of `block`, appended after the
  // block's existing children, order-preserving.
  const lastExistingKid = lastOf(existingKids);
  const followerRanks = Rank.nBetween(
    lastExistingKid ? Rank.from(lastExistingKid.rank) : null,
    null,
    followers.length,
  );
  if (followers.length > 0) {
    movedBlock = { ...movedBlock, expanded: true };
  }

  let next = replace(blocks, movedBlock);
  followers.forEach((follower, i) => {
    next = replace(next, {
      ...follower,
      parentId: block.id,
      rank: followerRanks[i]!.toJSON(),
    });
  });

  return next;
}

function applyInsert(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "insert" }>,
): BlockNode[] {
  let next = blocks;
  let newParentId: string | null;
  let newRank: Rank;
  let pageId: string | null;

  const afterId = op.afterId ?? null;
  const beforeId = op.beforeId ?? null;
  if (afterId) {
    const after = byId(blocks, afterId);
    if (!after) return blocks;
    const afterNext = nextSibling(blocks, after);
    newParentId = after.parentId;
    newRank = Rank.between(
      Rank.from(after.rank),
      afterNext ? Rank.from(afterNext.rank) : null,
    );
    pageId = after.pageId;
  } else if (beforeId) {
    const before = byId(blocks, beforeId);
    if (!before) return blocks;
    const beforePrev = prevSibling(blocks, before);
    newParentId = before.parentId;
    newRank = Rank.between(
      beforePrev ? Rank.from(beforePrev.rank) : null,
      Rank.from(before.rank),
    );
    pageId = before.pageId;
  } else {
    newParentId = op.parentId ?? null;
    const lastChild = lastOf(childrenOf(blocks, newParentId));
    newRank = Rank.between(lastChild ? Rank.from(lastChild.rank) : null, null);
    // Denormalized nearest page ancestor — same rule as the server's
    // `computePageId`. The reducer runs over a single page's *content* forest
    // (`loadPageBlocks` excludes the page row itself), so:
    //   - parent found, is a (sub-)page node → that page's id;
    //   - parent found, content block        → inherit its pageId;
    //   - parent NOT in the forest           → its id IS the page (a top-level
    //     insert is parented to the page row, which is excluded), so the new
    //     block's nearest page ancestor is `newParentId`;
    //   - no parent at all (root insert)     → null.
    // Using `parent.pageId` unconditionally dropped a top-level block's pageId to
    // null (a page's own pageId is null), hiding it from the page-scoped query.
    const parent = newParentId ? byId(blocks, newParentId) : undefined;
    pageId = parent
      ? parent.type === PAGE_BLOCK_TYPE
        ? parent.id
        : parent.pageId
      : newParentId;
  }

  // Open the parent (if any) so the new block is visible.
  if (newParentId) {
    const parent = byId(next, newParentId);
    if (parent) next = replace(next, { ...parent, expanded: true });
  }

  const newNode: BlockNode = {
    id: op.newId,
    pageId,
    parentId: newParentId,
    type: op.type,
    data: op.data,
    rank: newRank.toJSON(),
    expanded: false,
  };
  return add(next, newNode);
}

function applyDelete(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "delete" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  const ids = new Set(subtreeIds(blocks, op.blockId));
  return remove(blocks, ids);
}

function applyMove(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "move" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  // Cycle guard: refuse to move a block under its own descendant (or itself).
  if (op.parentId !== null && isDescendant(blocks, op.blockId, op.parentId)) {
    return blocks;
  }

  let next = replace(blocks, { ...block, parentId: op.parentId, rank: op.rank });
  // Open the new parent (if any).
  if (op.parentId) {
    const parent = byId(next, op.parentId);
    if (parent) next = replace(next, { ...parent, expanded: true });
  }
  return next;
}
