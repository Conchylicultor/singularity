import { z } from "zod";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { isDescendant, selectionRoots, subtreeIds } from "@plugins/primitives/plugins/tree/core";
import { PAGE_BLOCK_TYPE } from "./schemas";
import { planForestInsert, rankWindow } from "./block-forest";
import { IdentifiedBlockSchema, type IdentifiedBlock } from "./serialized-block";
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
       * Authoritative per-type-transformed `data` payload for the tail block —
       * e.g. a checked to-do splits into an UNCHECKED tail. Absent = inherit the
       * origin's `data` (today's behavior). It is resolved at the INTENT layer
       * (via a block handle's `dataOnSplit`), not here, because the pure reducer
       * cannot see block handles; a bad payload is caught by the strict
       * `parseBlockData` normalizer at the server write boundary (loud 400). The
       * reducer always overwrites `.text` with `afterRuns`, so only the
       * non-text fields of `tailData` survive.
       */
      tailData?: unknown;
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
  /**
   * Nest each of `blockIds` under its previous sibling. Indentation is a SET
   * operation — a single Tab in a block's text editor is simply the one-element
   * case — so the whole selected run moves as one rigid body (see `foldIndent`).
   */
  | { kind: "indent"; blockIds: string[] }
  /** Lift each of `blockIds` out to its parent's level (see `foldOutdent`). */
  | { kind: "outdent"; blockIds: string[] }
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
  /**
   * Dissolve a container in place: delete `blockId` and PROMOTE its children into
   * the slot it occupied among its own former siblings. Children keep their ids,
   * types, `data` and subtrees — only `parentId` and `rank` change — and their
   * order is preserved.
   *
   * This is how the caret escapes a container. The generic Backspace ladder would
   * otherwise resolve "start of the first child" to its `isIndented` → **outdent**
   * rung, and `outdentOne` adopts the followers: the first line would pop out of
   * the box AND take the rest of the container's content with it as its own
   * children — silently re-nesting content the user never asked to nest. Correct
   * for a one-line container, wrong for every other one. `unwrap` removes only the
   * container.
   */
  | { kind: "unwrap"; blockId: string }
  | { kind: "move"; blockId: string; parentId: string | null; rank: string }
  /**
   * Insert a whole forest (a clipboard paste, a file drop) as a sibling run.
   * The forest arrives with its ids ALREADY minted (`withMintedIds`), which is
   * exactly what lets a paste be an op rather than a bespoke endpoint: both
   * sides run `planForestInsert` over it and agree on every row's identity, so
   * the client can overlay the result immediately and the server's push is a
   * no-op confirmation instead of the first time the user sees their content.
   */
  | {
      kind: "paste";
      forest: IdentifiedBlock[];
      /** Insert after this block, inheriting its parent. */
      afterId: string | null;
      /**
       * Destination parent when `afterId` is null. The page's own id addresses
       * the content top level (page rows are excluded from the reducer's
       * forest, so a top-level insert is physically parented to the page).
       */
      parentId?: string | null;
    };

/**
 * Type facts the pure reducer cannot derive from the forest alone. Parameterized
 * on DATA rather than importing a slot — the precedent `core/markdown.ts` sets
 * ("Parameterized on `handles`, not a slot import, so it stays a leaf both
 * runtimes can call"): the web side builds it from the `Editor.Block`
 * contributions, the server from its own block registry, and neither runtime's
 * registry leaks into the other.
 *
 * Every field is optional and the default (`{}` — an empty anchor set) makes
 * `applyBlockOp` byte-identical to a context-free call. That is the property that
 * keeps every existing test, property test and fuzz seed valid.
 */
export interface BlockOpContext {
  /**
   * Block types declaring `BlockHandle.anchor` — containers that render no line
   * of their own. The reducer needs them for three things: refusing to split one
   * (it hosts no text), refusing to merge into or away one (same), and pruning a
   * container the last child just left.
   */
  anchorTypes?: ReadonlySet<string>;
}

/** The default context: no anchor types, i.e. today's behavior exactly. */
const NO_ANCHORS: ReadonlySet<string> = new Set<string>();

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
    tailData: z.unknown().optional(),
    runs: z.array(TextRunSchema).optional(),
  }),
  z.object({ kind: z.literal("merge"), blockId: z.string(), runs: z.array(TextRunSchema).optional() }),
  z.object({ kind: z.literal("indent"), blockIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("outdent"), blockIds: z.array(z.string()).min(1) }),
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
  z.object({ kind: z.literal("unwrap"), blockId: z.string() }),
  z.object({
    kind: z.literal("move"),
    blockId: z.string(),
    parentId: z.string().nullable(),
    rank: z.string(),
  }),
  z.object({
    kind: z.literal("paste"),
    forest: z.array(IdentifiedBlockSchema),
    afterId: z.string().nullable(),
    parentId: z.string().nullable().optional(),
  }),
]);

// ---------------------------------------------------------------------------
// Pure helpers — the single source of rank/tree math.
// ---------------------------------------------------------------------------

/** Nothing is leaving the sibling list — an insert bounds itself on every sibling. */
const NO_EXCLUSIONS: ReadonlySet<string> = new Set<string>();

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
 * descendant of `node`'s previous sibling. When `node` has NO previous sibling,
 * the visible line directly above it is its PARENT — so walk one step up (null at
 * the forest root). "Line", not "leaf": with the upward branch it can return a
 * parent, not only a leaf. Stops descending at a collapsed block (its children
 * aren't visible), so the result is exactly the block whose end the caret would
 * land at when crossing up. The exact dual of `nextVisibleLine`, so
 * `prevVisibleLine(nextVisibleLine(X)) === X` for every X with a next line.
 */
export function prevVisibleLine(blocks: BlockNode[], node: BlockNode): BlockNode | null {
  let cur = prevSibling(blocks, node);
  if (!cur) return node.parentId ? (byId(blocks, node.parentId) ?? null) : null;
  while (cur.expanded) {
    const kids = childrenOf(blocks, cur.id);
    if (kids.length === 0) break;
    cur = kids[kids.length - 1]!;
  }
  return cur;
}

/**
 * The next block in VISIBLE document order — the exact dual of `prevVisibleLine`:
 * the first visible child if `node` is expanded with children, else the nearest
 * following sibling found by walking up through ancestors. Null at the end of the
 * forest. Like its dual it stops at a page boundary naturally: a sub-page's
 * subtree lives in another `page_id` partition and is simply absent from `blocks`.
 */
export function nextVisibleLine(blocks: BlockNode[], node: BlockNode): BlockNode | null {
  // first visible child, else the nearest following sibling walking up
  if (node.expanded) {
    const kids = childrenOf(blocks, node.id);
    if (kids[0]) return kids[0];
  }
  let cur: BlockNode | null = node;
  while (cur) {
    const sib = nextSibling(blocks, cur);
    if (sib) return sib;
    cur = cur.parentId ? (byId(blocks, cur.parentId) ?? null) : null;
  }
  return null;
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

/**
 * Every node in visible document (top-to-bottom) order: a rank-ordered DFS from
 * the forest roots, descending into collapsed subtrees too (structure, not
 * visibility, is what the reducer folds over).
 *
 * A block's `rank` is only comparable against its OWN siblings — a global rank
 * sort is therefore NOT document order. The bulk indent/outdent folds depend on
 * true document order to compose, so this is the one place that derives it.
 */
function documentOrder(blocks: BlockNode[]): string[] {
  const present = new Set(blocks.map((b) => b.id));
  // Forest roots: nodes whose parent is outside this array (the page row is not
  // part of a page's content forest) or absent entirely.
  const roots = blocks
    .filter((b) => b.parentId === null || !present.has(b.parentId))
    .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)));
  const out: string[] = [];
  const walk = (node: BlockNode): void => {
    out.push(node.id);
    for (const child of childrenOf(blocks, node.id)) walk(child);
  };
  for (const root of roots) walk(root);
  return out;
}

/** `ids` sorted top-to-bottom in document order; ids absent from the forest are dropped. */
function inDocumentOrder(blocks: BlockNode[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return documentOrder(blocks).filter((id) => wanted.has(id));
}

/**
 * Where a paste lands while a block selection is active: as a sibling AFTER the
 * last selected subtree root in DOCUMENT order, falling back to the caret's own
 * block when nothing is selected.
 *
 * Not the range's head — that is the selection's MOVING end, which is the TOP of
 * the run whenever the user extended upward, and anchoring there drops the copies
 * inside the run it was meant to follow. Document order is direction-independent
 * by construction, so how the range was built cannot matter.
 *
 * Roots, not the last selected id: an insert after a root lands after that root's
 * entire subtree, so a selected parent's descendants are never split. A selection
 * spanning branches therefore anchors on whichever root is document-last — the
 * copies land as its siblings, nested where it is nested. That is "after the end
 * of the selection" read literally, and matches how the selection's other bulk
 * ops treat roots.
 */
export function pasteAnchorId(
  blocks: BlockNode[],
  selectedIds: ReadonlySet<string>,
  focusedBlockId: string | null,
): string | null {
  const roots = selectionRoots(blocks, selectedIds);
  return lastOf(inDocumentOrder(blocks, roots)) ?? focusedBlockId ?? null;
}

/** The ids a `BlockOp` names — its write targets. Shared by the optimistic
 *  overlay's op-identity predicate and the server's notify path. */
export function opBlockIds(op: BlockOp): string[] {
  switch (op.kind) {
    case "split":
      return [op.blockId, op.newId];
    case "insert":
      return [op.newId];
    case "merge":
    case "delete":
    case "move":
    // `unwrap` also re-ranks the promoted children, deliberately omitted here —
    // the same documented under-approximation as split's adopted children and
    // merge's rewritten target: less cascade-confirmation coverage, never a
    // wrong drop.
    case "unwrap":
      return [op.blockId];
    case "indent":
    case "outdent":
      return op.blockIds;
    case "paste":
      // ROOT ids only — the same deliberate under-approximation split/merge
      // make. The whole planned forest is inserted in ONE transaction, so a
      // root's presence already implies its descendants'; listing every node
      // would make this (and the O(n) scans keyed off it) grow with the size
      // of the paste for no extra confirmation power.
      return op.forest.map((n) => n.id);
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Apply a single block op to the full in-memory page block list, purely. Never
 * mutates `blocks` (returns a new array with new node objects for changed
 * nodes), and never changes a surviving node's `pageId` (in-page invariant).
 *
 * `ctx` carries the type facts the forest cannot supply (today: which types are
 * container anchors). It defaults to `{}`, which is byte-identical to a
 * context-free call — see `BlockOpContext`.
 */
export function applyBlockOp(
  blocks: BlockNode[],
  op: BlockOp,
  ctx: BlockOpContext = {},
): BlockNode[] {
  const anchorTypes = ctx.anchorTypes ?? NO_ANCHORS;
  const next = applyOp(blocks, op, anchorTypes);
  return pruneEmptyAnchors(next, anchorTypes);
}

function applyOp(
  blocks: BlockNode[],
  op: BlockOp,
  anchorTypes: ReadonlySet<string>,
): BlockNode[] {
  switch (op.kind) {
    case "split":
      return applySplit(blocks, op, anchorTypes);
    case "merge":
      return applyMerge(blocks, op, anchorTypes);
    case "indent":
      return foldIndent(blocks, op.blockIds).next;
    case "outdent":
      return foldOutdent(blocks, op.blockIds).next;
    case "insert":
      return applyInsert(blocks, op);
    case "delete":
      return applyDelete(blocks, op);
    case "unwrap":
      return applyUnwrap(blocks, op);
    case "move":
      return applyMove(blocks, op);
    case "paste":
      return applyPaste(blocks, op);
  }
}

/**
 * Drop every container anchor the forest left childless. An anchor's content IS
 * its children, so a childless one is an empty box the user cannot have meant to
 * keep — the last child leaving (outdent, move, merge, delete) is what dissolves
 * the container.
 *
 * A POST-PASS derived from the CURRENT forest at application time, never a flag
 * minted at intent time — the same argument `applySplit`'s adoption comment
 * makes: ops apply against the current forest (the optimistic overlay replays
 * onto a refreshed base, and the server applies against its own load), so a
 * decision frozen when the keystroke fired could contradict the forest by the
 * time the op actually applies. Deriving keeps it true at the moment of
 * application, byte-identical on client and server.
 *
 * Iterated to a fixed point because anchors nest: an anchor whose only child was
 * an anchor is itself empty once that one goes.
 *
 * A `PAGE_BLOCK_TYPE` row is NEVER pruned, whatever `anchorTypes` says — an
 * empty page is legitimate content, and deleting one here would FK-cascade a
 * whole sub-page away from a keystroke. That is the catastrophic false positive,
 * so it is guarded explicitly and pinned by test.
 *
 * Known gap, deliberate: an `insert` op naming an anchor type mints a childless
 * anchor that this pass immediately removes. Anchors are never born that way —
 * the wrap mints the anchor and its first child in ONE patch (not an op). The
 * remaining paths that CAN leave an empty anchor are `bulkDelete` and `bulkMove`,
 * which bypass the reducer entirely on both sides (their own endpoints on the
 * server, hand-computed after-states on the client), and there the surface's
 * one-line childless fallback makes the result visible and deletable rather than
 * a ghost. `paste` used to be in that list; since it became a `BlockOp` it flows
 * through `applyBlockOp` like every other op and is pruned here too.
 */
function pruneEmptyAnchors(
  blocks: BlockNode[],
  anchorTypes: ReadonlySet<string>,
): BlockNode[] {
  if (anchorTypes.size === 0) return blocks; // identity: today's behavior
  let next = blocks;
  for (;;) {
    const parents = new Set(next.map((b) => b.parentId));
    const doomed = next
      .filter((b) => anchorTypes.has(b.type) && b.type !== PAGE_BLOCK_TYPE && !parents.has(b.id))
      .map((b) => b.id);
    if (doomed.length === 0) return next;
    next = remove(next, doomed);
  }
}

function applySplit(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "split" }>,
  anchorTypes: ReadonlySet<string>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  // A page row owns no text, so there is nothing to split, and `asChild` would
  // seed the new node into the sub-page's own `page_id` partition without ever
  // stamping it. Structurally unreachable (the renderer registers no text
  // surface, so Enter can't originate here) — the guard is the belt.
  if (block.type === PAGE_BLOCK_TYPE) return blocks;
  // Same belt, same argument, for a container anchor: it renders no line, hosts
  // no text surface and registers no focus handle, so Enter cannot originate in
  // one. A split there would write `data.text` onto a void schema (400 at the
  // write boundary) and mint a second empty container.
  if (anchorTypes.has(block.type)) return blocks;

  // Live callers pass authoritative `op.runs`; the `runsOfNode` fallback (lagged
  // `data.text` projection) is the pure reducer's basis (tests / non-live).
  const runs = op.runs ?? runsOfNode(block);
  const [beforeRuns, afterRuns] = splitRuns(runs, op.position);

  // Enter at the START of a NON-EMPTY block: preserve the origin's identity.
  // Insert a NEW EMPTY sibling immediately ABOVE and leave the origin completely
  // untouched (id, full text, children subtree, content doc, expanded, data). The
  // caret stays in the origin at offset 0 (the executor's job). Notion's model —
  // and it keeps the text's block id stable, so block-id-keyed state never churns.
  // `afterRuns.length > 0` isolates this from EMPTY-block Enter (position 0 but
  // nothing after the caret), which must keep spawning a plain empty sibling BELOW
  // with the caret moving down. asChild and mid/end splits are unaffected.
  if (!op.asChild && op.position === 0 && afterRuns.length > 0) {
    const prev = prevSibling(blocks, block);
    const aboveRank = Rank.between(
      prev ? Rank.from(prev.rank) : null,
      Rank.from(block.rank),
    );
    const aboveNode: BlockNode = {
      id: op.newId,
      pageId: block.pageId,
      parentId: block.parentId,
      type: op.siblingType ?? block.type,      // siblingType is never set here; belt-and-braces
      data: { ...asObject(op.tailData !== undefined ? op.tailData : block.data), text: [] },
      rank: aboveRank.toJSON(),
      expanded: false,
    };
    return add(blocks, aboveNode);              // origin's object reference returned untouched
  }

  let next = blocks;
  let updatedBlock = withRuns(block, beforeRuns);

  let newParentId: string | null;
  let newType: string;
  let newRank: Rank;
  // Visible children the tail adopts (non-asChild arm only; empty otherwise).
  let adopted: BlockNode[] = [];
  let tailExpanded = false;
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

    // Visible-line invariant: a split turns one visible line into two ADJACENT
    // visible lines — the tail is the immediately-next visible line, and no
    // other line changes position or depth. A plain sibling insert satisfies
    // that only when the origin has no visible children; otherwise the tail
    // would render AFTER the whole subtree. So when the origin has VISIBLE
    // children (`expanded` with a non-empty child set) the tail ADOPTS them
    // all: each child is reparented to `op.newId` keeping its rank string
    // byte-for-byte (the whole sibling set moves together, so uniqueness/order
    // carry), and the tail inherits the subtree by opening (`expanded: true`).
    // Collapsed children are not visible lines, so they stay with the head.
    //
    // This is DERIVED from the current forest inside the reducer, not carried on
    // the op, because ops apply against the CURRENT forest — overlay replays
    // onto a refreshed base, and the server applies against its own load — so a
    // flag frozen at intent time could contradict the forest at application
    // time (e.g. a racing collapse). Deriving keeps the invariant true at the
    // moment the op is applied. It is the exact mirror of `applyMerge`'s
    // adoption below: after this split the head is childless, so
    // `prevVisibleLine(tail)` resolves to the head and a following merge
    // re-adopts — which is what makes split∘merge round-trip.
    const visibleChildren = block.expanded ? childrenOf(blocks, block.id) : [];
    if (visibleChildren.length > 0) {
      adopted = visibleChildren;
      tailExpanded = true;
    }
  }

  next = replace(next, updatedBlock);

  // Tail data: `op.tailData` is the authoritative per-type-transformed payload
  // (e.g. a checked to-do → unchecked tail), resolved at the intent layer.
  // Absent, the origin's data is inherited — but ONLY when the tail is the SAME
  // type. `data` belongs to a type: carrying a callout's `{icon, color,
  // iconSvgNodes}` onto a `text` tail hands the write boundary a payload its
  // strict schema rejects outright (400 `Unrecognized key(s)`), which is exactly
  // what a container's `splitChildWhenExpanded: {childType: "text"}` produces on
  // every Enter. A cross-type tail therefore starts from `{}` and lets the
  // target schema's own defaults fill it in. This stayed latent until a block
  // type carried more than `{text}`: every earlier cross-type split (heading →
  // text, list → text) happened to be between structurally identical schemas.
  const inheritsData = newType === block.type;
  const tailBase =
    op.tailData !== undefined ? op.tailData : inheritsData ? block.data : {};
  const newData = { ...asObject(tailBase), text: afterRuns };
  const newNode: BlockNode = {
    id: op.newId,
    pageId: block.pageId,
    parentId: newParentId,
    type: newType,
    data: newData,
    rank: newRank.toJSON(),
    expanded: tailExpanded,
  };
  next = add(next, newNode);

  // Reparent the adopted children to the tail, rank strings preserved.
  for (const child of adopted) {
    next = replace(next, { ...child, parentId: op.newId });
  }
  return next;
}

function applyMerge(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "merge" }>,
  anchorTypes: ReadonlySet<string>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  // A page row carries no text to merge away, and merging DELETES the merged
  // block — which would take the whole sub-page (and its FK-cascaded content)
  // with it, from a keystroke.
  if (block.type === PAGE_BLOCK_TYPE) return blocks;
  // A container anchor carries no text either, and merging it away would delete
  // the container out from under its children. Escaping a container is `unwrap`.
  if (anchorTypes.has(block.type)) return blocks;

  // Merge into the previous VISIBLE line (the deepest last expanded descendant
  // of the prev sibling, or the parent when the block is a first child), not the
  // immediate sibling — so the caret lands where the text visually joins,
  // matching document order.
  const prev = prevVisibleLine(blocks, block);
  if (!prev) return blocks; // no-op
  // Merging into a page row would write a `data.text` onto a `PageDataSchema`
  // payload AND adopt this block's children across the page boundary (under a
  // row whose subtree lives in another `page_id` partition). Neither is
  // representable — refuse.
  if (prev.type === PAGE_BLOCK_TYPE) return blocks;
  // Merging INTO a container anchor would write `data.text` onto a void schema
  // (400 at the write boundary) and adopt this block's children under a row that
  // renders no line — i.e. dissolve the box from one keypress. This is the live
  // hazard the two guards above are only the belt for: `nextVisibleLine` happily
  // returns an anchor, so Delete at the end of the line ABOVE a container
  // resolves here. Refusing demotes it to a plain caret move.
  if (anchorTypes.has(prev.type)) return blocks;

  // Concatenate runs into prev (coalescing the seam). `op.runs` is the live
  // merging runs on the live path; `runsOfNode` (lagged projection) is only the
  // pure reducer's fallback basis (tests / non-live).
  let mergedPrev = withRuns(prev, mergeRuns(runsOfNode(prev), op.runs ?? runsOfNode(block)));

  // Adopt the block's children under prev, order-preserving. The general rule is
  // that adopted children occupy the visible position the merged block occupied:
  //  - `prev` is the merged block's own PARENT (the upward `prevVisibleLine`
  //    case, so `block` is prev's FIRST child) → the children take `block`'s slot,
  //    BEFORE `block`'s former next siblings.
  //  - otherwise `prev` is a previous sibling's deepest leaf, and nothing of
  //    `prev`'s follows → append after prev's existing children (today's rule).
  //
  // In the `intoParent` case the lower bound is `block`'s OWN rank, not `null`.
  // `block` is being deleted, so its slot `(block.rank, nextSibling)` is vacated
  // and the adopted children land in it — visually first, since `block` was the
  // first child. Crucially this also avoids a TRANSIENT unique-constraint
  // violation on the server: the write applies UPDATEs (the reparented children)
  // BEFORE the DELETE (of `block`), so an adopted rank of `null..next` could mint
  // `block`'s own still-live rank and collide on `(parent_id, rank)`. Minting
  // strictly ABOVE `block.rank` can never equal a live sibling's rank.
  const adopted = childrenOf(blocks, block.id);
  const intoParent = prev.id === block.parentId;
  const existingPrevKids = childrenOf(blocks, prev.id);
  const lastPrevKid = lastOf(existingPrevKids);
  const nextAfterBlock = nextSibling(blocks, block);
  const adoptedRanks = intoParent
    ? Rank.nBetween(
        Rank.from(block.rank),
        nextAfterBlock ? Rank.from(nextAfterBlock.rank) : null,
        adopted.length,
      )
    : Rank.nBetween(lastPrevKid ? Rank.from(lastPrevKid.rank) : null, null, adopted.length);
  if (adopted.length > 0) {
    mergedPrev = { ...mergedPrev, expanded: true };
  }

  let next = replace(blocks, mergedPrev);
  adopted.forEach((child, i) => {
    next = replace(next, { ...child, parentId: prev.id, rank: adoptedRanks[i]!.toJSON() });
  });

  return remove(next, [block.id]);
}

/**
 * Nest ONE block under its previous sibling. Returns `null` when the move is not
 * available (no previous sibling, or the sibling is a page row).
 */
function indentOne(blocks: BlockNode[], blockId: string): BlockNode[] | null {
  const block = byId(blocks, blockId);
  if (!block) return null;
  const prev = prevSibling(blocks, block);
  if (!prev) return null;
  // Reparenting under a page row moves the block into that sub-page's subtree
  // while its `page_id` still names the outer page — a row reachable by no
  // page-scoped query. The reducer cannot restamp `page_id` (in-page
  // invariant), so Tab-into-a-page is simply not a move.
  if (prev.type === PAGE_BLOCK_TYPE) return null;

  const lastChild = lastOf(childrenOf(blocks, prev.id));
  const newRank = Rank.between(lastChild ? Rank.from(lastChild.rank) : null, null);

  let next = replace(blocks, { ...block, parentId: prev.id, rank: newRank.toJSON() });
  next = replace(next, { ...prev, expanded: true });
  return next;
}

/**
 * Lift ONE block out to its parent's level, adopting the siblings that followed
 * it as its own children (Notion's outdent: the visual subtree below the block
 * stays attached to it). Returns `null` when the move is not available (already
 * top level, or the parent is a page row — outdenting past it escapes the page).
 */
function outdentOne(blocks: BlockNode[], blockId: string): BlockNode[] | null {
  const block = byId(blocks, blockId);
  if (!block) return null;
  if (!block.parentId) return null; // already at top level

  const parent = byId(blocks, block.parentId);
  if (!parent) return null;
  if (parent.type === PAGE_BLOCK_TYPE) return null;

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

/** The result of a bulk fold: the next forest and which blocks actually moved. */
type Fold = { next: BlockNode[]; moved: string[] };

/**
 * Indent a SET of blocks: fold `indentOne` over them in TOP-TO-BOTTOM document
 * order.
 *
 * The direction is what makes the set move as one rigid body. A successful
 * indent removes the mover from its sibling list, so the next selected sibling's
 * previous sibling becomes that same new parent — the run lands as consecutive
 * children of the block above it, preserving its internal shape.
 *
 * The `blockIds` guard is the other half: when a block cannot indent (it is the
 * first child), the selected sibling below it would otherwise nest *into* it and
 * silently reshape the selection. Refusing to nest under a selected block that
 * stayed put makes that skip cascade down the run — the whole run holds still,
 * which is what "indent these blocks" must mean.
 */
function foldIndent(blocks: BlockNode[], blockIds: readonly string[]): Fold {
  if (blockIds.length === 0) return { next: blocks, moved: [] };
  const selected = new Set(blockIds);
  const moved: string[] = [];
  let next = blocks;
  for (const id of inDocumentOrder(blocks, blockIds)) {
    const node = byId(next, id);
    if (!node) continue;
    const prev = prevSibling(next, node);
    // Still a sibling of a selected block ⇒ that block failed to indent.
    if (prev && selected.has(prev.id)) continue;
    const applied = indentOne(next, id);
    if (!applied) continue;
    next = applied;
    moved.push(id);
  }
  return { next, moved };
}

/**
 * Outdent a SET of blocks: fold `outdentOne` over them in BOTTOM-TO-TOP document
 * order — the mirror of `foldIndent`'s direction, for the mirror reason.
 *
 * `outdentOne` adopts the followers that remain below the block. Going bottom-up,
 * every selected follower has already left its parent by the time an earlier
 * block moves, so the selection's internal shape survives and only UNSELECTED
 * followers are adopted — by the last selected block, exactly as outdenting that
 * block alone would do. (Top-down, the first block would swallow the rest of the
 * selection as children.) Landing each mover directly after its parent then
 * stacks them back into their original relative order.
 */
function foldOutdent(blocks: BlockNode[], blockIds: readonly string[]): Fold {
  if (blockIds.length === 0) return { next: blocks, moved: [] };
  const moved: string[] = [];
  let next = blocks;
  for (const id of inDocumentOrder(blocks, blockIds).reverse()) {
    const applied = outdentOne(next, id);
    if (!applied) continue;
    next = applied;
    moved.push(id);
  }
  return { next, moved: moved.reverse() };
}

/** Would indenting `blockIds` move anything? Drives the selection bar's affordance. */
export function canIndent(blocks: BlockNode[], blockIds: readonly string[]): boolean {
  return foldIndent(blocks, blockIds).moved.length > 0;
}

/** Would outdenting `blockIds` move anything? Drives the selection bar's affordance. */
export function canOutdent(blocks: BlockNode[], blockIds: readonly string[]): boolean {
  return foldOutdent(blocks, blockIds).moved.length > 0;
}

// ---------------------------------------------------------------------------
// Bulk move (the drag of a whole selection)
// ---------------------------------------------------------------------------

/** Where one selection root lands. Field-compatible with `parkRanks`' `RankPlacement`. */
export interface BulkMovePlacement {
  id: string;
  /** The parent the row sits under NOW — the scope `parkRanks` parks it in. */
  currentParentId: string | null;
  parentId: string | null;
  /** Stored string form, like every `BlockNode.rank`. */
  rank: string;
}

/** Why a bulk move was refused. Each maps 1:1 to a distinguishable server 4xx. */
export type BulkMoveRefusal = "empty-selection" | "into-selection" | "into-own-subtree";

export interface BulkMovePlan {
  /** In DOCUMENT order. Empty iff `refusal !== null`. */
  placements: BulkMovePlacement[];
  /** The selection roots, document-ordered (what each writer re-reads / notifies). */
  roots: string[];
  /** The destination parent to open, or null for a top-level drop. */
  expandParentId: string | null;
  refusal: BulkMoveRefusal | null;
}

function refusedBulkMove(refusal: BulkMoveRefusal): BulkMovePlan {
  return { placements: [], roots: [], expandParentId: null, refusal };
}

/**
 * Plan where a whole selection lands when it is dragged under `parentId`,
 * immediately after `afterId` (or at the start of that sibling list when
 * `afterId` is null). Pure: the ONE definition of bulk-move's rank/order algebra,
 * run verbatim by the server writer, the in-memory store, and the provider's undo
 * prediction — if the three disagreed, the recorded undo patch would be wrong.
 *
 * **All-or-nothing, which is why this is `plan*` and not `fold*`.** A `Fold` in
 * this file is a per-element fold with PARTIAL refusal (`foldIndent` skips a
 * blocked block and cascades), and its `moved` subset names a state the forest
 * really reaches. A bulk move has no correct partial answer — a destination
 * inside the moving selection is not "one root that cannot go", it invalidates
 * the whole gesture — so a `moved` subset here would imply a state that cannot
 * occur. `plan*` also matches `planForestInsert`, the structural twin.
 *
 * **Roots are ordered by `inDocumentOrder`, and that is load-bearing.**
 * `selectionRoots` preserves the order ids appear in the INPUT ARRAY, and the two
 * writers hold that array in different orders (the server's `loadPageBlocks` has
 * no `ORDER BY` at all — Postgres heap order, which `UPDATE`s rewrite; a client
 * holds a global rank sort, which is not document order either). Minting the rank
 * run against an arbitrary order silently scrambles the selection's internal
 * order on the way down, and makes the two sides disagree about which root got
 * which key. The folds sort for exactly this reason.
 *
 * **Guards return a `refusal`; they never throw and never silently no-op.** A
 * pure core helper cannot throw `HttpError` (wrong layer), and swallowing would
 * rob the server of the two distinguishable 400s it owes the user. Clients treat
 * any refusal as drop-before-record, the same discipline `dispatchOp` applies to
 * an empty reducer diff.
 *
 * @param destSiblings MUST be the COMPLETE live sibling set under `parentId` —
 * EVERY row with that `parent_id`, unfiltered by page and unfiltered by type. It
 * defaults to `blocks` because a client holds its page's forest whole, but the
 * server MUST pass `loadLiveSiblings(tx, parentId)`: a destination page row's
 * children are keyed to that page and are therefore absent from a page-scoped
 * load, so a window computed over page-scoped rows mints `"a0"` straight onto the
 * sub-page's existing first child. `page_blocks` has ONE `(parent_id, rank)`
 * ordering space that several live resources project disjointly — arithmetic over
 * a filtered projection mints keys that collide with the siblings it cannot see.
 */
export function planBulkMove(
  blocks: BlockNode[],
  args: { ids: readonly string[]; parentId: string | null; afterId: string | null },
  destSiblings: BlockNode[] = blocks,
): BulkMovePlan {
  const moving = new Set(args.ids);
  const roots = inDocumentOrder(blocks, selectionRoots(blocks, moving));
  if (roots.length === 0) return refusedBulkMove("empty-selection");

  // Cycle guard: the selection cannot land inside itself (nor onto itself).
  if (args.parentId !== null) {
    if (moving.has(args.parentId)) return refusedBulkMove("into-selection");
    for (const root of roots) {
      if (isDescendant(blocks, root, args.parentId)) {
        return refusedBulkMove("into-own-subtree");
      }
    }
  }

  // Exclude everything that is moving, so the moved roots don't bound their own
  // insertion window. (The excluded ids can therefore collide transiently with a
  // still-unmoved root's rank — which is what the server's park-then-place phase
  // exists to absorb; see `rank-park.ts`.)
  const movingSubtree = new Set(roots.flatMap((r) => subtreeIds(blocks, r)));
  const [prev, next] = rankWindow(destSiblings, args.parentId, args.afterId, movingSubtree);
  const ranks = Rank.nBetween(prev, next, roots.length);

  const placements = roots.map((id, i) => ({
    id,
    currentParentId: byId(blocks, id)!.parentId,
    parentId: args.parentId,
    rank: ranks[i]!.toJSON(),
  }));
  return { placements, roots, expandParentId: args.parentId, refusal: null };
}

/**
 * Apply a `planBulkMove` result to a forest: reparent + re-rank each placement
 * and open the destination, so a client's predicted after-state is byte-identical
 * to what the server's writer commits.
 *
 * Deliberately does NOT recompute `pageId` — the same in-page invariant
 * `applyMove` holds. Reparenting CAN cross a page boundary, but only the server
 * knows the whole tree, so it owns that (`recomputePageIdSubtree`); the composite
 * client store refuses cross-page bulk moves outright rather than guessing.
 *
 * Deliberately does NOT run `pruneEmptyAnchors` either. `bulkMove` is not a
 * `BlockOp`: it bypasses the reducer on both sides (its own endpoint on the
 * server, a hand-computed after-state on the client), exactly as `bulkDelete`
 * does. Pruning here would make the client's prediction diverge from the server's
 * commit, which is the one thing this pair exists to prevent.
 *
 * A refused plan is the identity — its `placements` are empty by construction.
 */
export function applyBulkMove(blocks: BlockNode[], plan: BulkMovePlan): BlockNode[] {
  let next = blocks;
  for (const p of plan.placements) {
    const node = byId(next, p.id);
    if (!node) continue;
    next = replace(next, { ...node, parentId: p.parentId, rank: p.rank });
  }
  if (plan.placements.length > 0 && plan.expandParentId) {
    const parent = byId(next, plan.expandParentId);
    if (parent && !parent.expanded) next = replace(next, { ...parent, expanded: true });
  }
  return next;
}

/**
 * The denormalized nearest page ancestor of a would-be child of `parentId` —
 * the same rule as the server's `computePageId`, decided from the in-memory
 * forest. Shared by every insert path (`insert`, `paste`) so a new row's page
 * scope has exactly one definition.
 *
 * The reducer runs over a single page's *content* forest (`loadPageBlocks`
 * excludes the page row itself), so:
 *   - parent found, is a (sub-)page node → that page's id;
 *   - parent found, content block        → inherit its pageId;
 *   - parent NOT in the forest           → its id IS the page (a top-level
 *     insert is parented to the page row, which is excluded), so the new
 *     block's nearest page ancestor is `parentId`;
 *   - no parent at all (root insert)     → null.
 * Using `parent.pageId` unconditionally dropped a top-level block's pageId to
 * null (a page's own pageId is null), hiding it from the page-scoped query.
 */
function insertScopePageId(blocks: BlockNode[], parentId: string | null): string | null {
  const parent = parentId ? byId(blocks, parentId) : undefined;
  if (!parent) return parentId;
  return parent.type === PAGE_BLOCK_TYPE ? parent.id : parent.pageId;
}

/**
 * Insert a whole identified forest as a contiguous sibling run, after `afterId`
 * (inheriting its parent) or under `op.parentId`. Same id/rank algebra the
 * server's `insertForest` runs — literally the same `planForestInsert` — so the
 * optimistic overlay and the persisted rows differ only in the ranks each side
 * minted against the sibling set it can see.
 *
 * A missing anchor refuses the whole paste (returns `blocks` unchanged), exactly
 * as `applyInsert` refuses a missing `afterId`: the destination the user aimed
 * at is gone, and guessing another one would drop their content somewhere they
 * did not ask for.
 */
function applyPaste(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "paste" }>,
): BlockNode[] {
  if (op.forest.length === 0) return blocks;

  const after = op.afterId ? byId(blocks, op.afterId) : undefined;
  if (op.afterId && !after) return blocks;
  const parentId = after ? after.parentId : op.parentId ?? null;

  const [prev, nextRank] = rankWindow(blocks, parentId, op.afterId, NO_EXCLUSIONS);
  const { nodes } = planForestInsert({
    pageId: insertScopePageId(blocks, parentId),
    parentId,
    rootRanks: Rank.nBetween(prev, nextRank, op.forest.length),
    forest: op.forest,
  });

  // Open the destination parent (if it is a row we hold) so the pasted blocks
  // are visible — the same courtesy `applyInsert` does.
  let next = blocks;
  if (parentId) {
    const parent = byId(next, parentId);
    if (parent && !parent.expanded) next = replace(next, { ...parent, expanded: true });
  }
  return [...next, ...nodes];
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
    pageId = insertScopePageId(blocks, newParentId);
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

/**
 * Dissolve a container: delete the block and promote its children into the slot
 * it occupied among its own former siblings, order preserved. Ids, types, `data`
 * and whole subtrees ride along untouched — only `parentId` and `rank` change.
 * A childless block is simply deleted.
 *
 * The rank window mirrors `applyMerge`'s `intoParent` adoption branch byte for
 * byte, and for its reason: the lower bound is the block's OWN rank, not its
 * previous sibling's. The server write applies the UPDATEs (the promoted
 * children) BEFORE the DELETE (of the container), so the container's rank is
 * still live under the shared parent while the children are re-ranked — and a
 * window of `(prevSibling, next)` provably CAN mint exactly it (`nBetween("a0",
 * "a2", 1)` is `"a1"`), violating the `(parent_id, rank)` live-unique index.
 * Minting strictly ABOVE the container's rank cannot collide, and lands in the
 * same visual slot since the container is going away.
 */
function applyUnwrap(
  blocks: BlockNode[],
  op: Extract<BlockOp, { kind: "unwrap" }>,
): BlockNode[] {
  const block = byId(blocks, op.blockId);
  if (!block) return blocks;
  // Unwrapping a page row would promote its content across the page boundary
  // (rows whose `parent_id` and `page_id` disagree) and delete the sub-page.
  if (block.type === PAGE_BLOCK_TYPE) return blocks;

  const promoted = childrenOf(blocks, block.id);
  const nextAfterBlock = nextSibling(blocks, block);
  const ranks = Rank.nBetween(
    Rank.from(block.rank),
    nextAfterBlock ? Rank.from(nextAfterBlock.rank) : null,
    promoted.length,
  );

  let next = blocks;
  promoted.forEach((child, i) => {
    next = replace(next, { ...child, parentId: block.parentId, rank: ranks[i]!.toJSON() });
  });
  return remove(next, [block.id]);
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
