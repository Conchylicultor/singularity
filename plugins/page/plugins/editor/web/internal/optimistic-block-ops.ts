// Optimistic overlay layer for the block editor's structural keystroke ops.
//
// The client runs the SAME pure `applyBlockOp` reducer the server runs, applied
// optimistically through `useOptimisticResource`. A small `OpEffect` fingerprint
// — captured at dispatch from the predicted next state — drives BOTH:
//   - the idempotency apply-guard (`applyOverlayOp` throws `OpNoLongerApplies`
//     when the base already reflects the op, so replay drops it — no double
//     apply / key collision), and
//   - content-based confirmation (`isReflected` on a fresh server snapshot).
//
// Pure module (no React): unit-tested directly in `optimistic-block-ops.test.ts`.

import { Rank } from "@plugins/primitives/plugins/rank/core";
import { OpNoLongerApplies } from "@plugins/primitives/plugins/optimistic-mutation/web";
import {
  applyBlockOp,
  childrenOf,
  dataEqual,
  namesField,
  opBlockIds,
  type BlockFieldChanges,
  type BlockNode,
  type BlockOp,
  type BlockOpContext,
  type BlockPatch,
} from "../../core";
import type { Block } from "../../core";

/** Where one block landed, as the reducer predicted it. */
type PredictedMove = { id: string; parentId: string | null; rank: string };

/**
 * A compact fingerprint of what an op produces, captured at dispatch against the
 * current optimistic state. `isReflected` reuses it for both the apply-guard and
 * confirmation, so client prediction and server truth are compared with one
 * predicate. `reparent` keys on parent AND rank so a same-parent reorder isn't
 * falsely judged already-applied.
 */
export type OpEffect =
  // split, insert → the minted `newId` appears; paste/duplicate → their minted
  // ROOT ids do. A list rather than one id so a forest insert is expressible: the
  // whole planned forest lands in one server transaction, so the roots' presence
  // already implies their descendants'.
  | { kind: "create"; ids: string[] }
  // merge → the merged block disappears; delete → every named root does. A list
  // for the same reason `reparent` is one: deletion is a SET operation, and one
  // gesture is one op.
  | { kind: "remove"; ids: string[] }
  // indent/outdent/move/bulkMove → every listed block sits at its predicted parent+rank.
  // A list, not one id: indent/outdent are set operations (a single Tab is the
  // one-element case). Only blocks that ACTUALLY moved are listed, so an op the
  // reducer partially refused still confirms on exactly what it did.
  | { kind: "reparent"; moves: PredictedMove[] }
  /**
   * `unwrap` → the container `id` is gone AND each of its former children sits at
   * its predicted parent+rank. Both halves, conjoined: the op has TWO effects on
   * the rows and either one alone mis-describes it.
   *
   * Not a bare `remove`: an anchor that vanished with its children still absent
   * (another client hard-deleted the subtree) would read as absorbed, so the
   * replay would drop an op whose promotion never happened. Not a bare
   * `reparent` either: the promotion alone can be true while the empty container
   * row survives. The conjunction is exactly "the forest already looks like the
   * unwrap ran", which is what the apply-guard and confirmation both ask.
   *
   * `moves` may legitimately be EMPTY (a childless container unwraps to a plain
   * delete) — unlike `reparent`, that is not vacuous here, because the removal
   * conjunct still has to hold.
   */
  | { kind: "unwrap"; id: string; moves: PredictedMove[] };

/**
 * The overlay `Vars` carried by `useOptimisticResource`. Two variants share the
 * one `useOptimisticResource` instance so structural ops AND undo/redo patches
 * flow through the same overlay/replay + freeze pipeline:
 *
 *  - `op` — a single `BlockOp` applied through the shared `applyBlockOp` reducer
 *    (the forward keystroke/structural edits). Confirmed by its `OpEffect`.
 *  - `patch` — a minimal `BlockPatch` (create rows + field-scoped updates +
 *    delete ids) applied directly onto the client `Block[]` (the undo/redo
 *    inverse path). Confirmed when every created row is present and matching,
 *    every update's NAMED fields have landed, and every deleted id is absent.
 */
export type BlockOverlayOp =
  | { tag: "op"; op: BlockOp; effect: OpEffect }
  | { tag: "patch"; patch: BlockPatch };

/**
 * Block ids an overlay op writes — the op-identity basis for cascade
 * confirmation (`sameTarget` on `useOptimisticResource`). A patch touches its
 * upserted + deleted rows; a structural op touches the rows the `BlockOp`
 * names (`blockId`, and the minted `newId` for split/insert). Deliberately an
 * UNDER-approximation where an op has row side effects it doesn't name (e.g.
 * merge also rewrites the unnamed target row): missing a target only means
 * less cascading — the op survives until its own confirming push — never a
 * wrong drop.
 */
function overlayOpTargets(v: BlockOverlayOp): string[] {
  if (v.tag === "patch") {
    return [
      ...v.patch.creates.map((b) => b.id),
      ...v.patch.updates.map((u) => u.id),
      ...v.patch.deleteIds,
    ];
  }
  return opBlockIds(v.op);
}

/**
 * Do two overlay ops write at least one common block row? The `sameTarget`
 * predicate for cascade confirmation: only a newer CONFIRMED op on the same
 * row(s) may supersede an older resolved one (the snapshot provably contains
 * the older write's effect on that row). The stuck-inverse-pair case this
 * keeps fixed — an undo patch and its redo inverse — always shares its full
 * id set, so the pair cascades; unrelated rows (e.g. a `projectText` patch on
 * another block) never do.
 */
export function sameOverlayTarget(a: BlockOverlayOp, b: BlockOverlayOp): boolean {
  const aIds = overlayOpTargets(a);
  const bIds = new Set(overlayOpTargets(b));
  return aIds.some((id) => bIds.has(id));
}

/** Has `blocks` already absorbed `e`? Single predicate for guard + confirmation. */
export function isReflected(blocks: Block[], e: OpEffect): boolean {
  switch (e.kind) {
    case "create": {
      // `ids` is never empty (an op with an empty reducer diff — an empty paste
      // or duplicate — is never dispatched), so this is not vacuously true.
      const present = new Set(blocks.map((b) => b.id));
      return e.ids.every((id) => present.has(id));
    }
    case "remove": {
      // `ids` is never empty (a delete naming nothing is dropped before
      // dispatch), so this is not vacuously true.
      const present = new Set(blocks.map((b) => b.id));
      return e.ids.every((id) => !present.has(id));
    }
    case "reparent":
      // `moves` is never empty (a no-op op is never dispatched — `dispatchOp`
      // drops it), so this is not vacuously true.
      return e.moves.every((m) => movedTo(blocks, m));
    case "unwrap":
      // Both halves: the container gone AND every promoted child where the
      // reducer put it (see the effect's doc for why neither alone will do).
      return !blocks.some((b) => b.id === e.id) && e.moves.every((m) => movedTo(blocks, m));
  }
}

/** Does `blocks` place `m.id` at exactly the predicted parent + rank? */
function movedTo(blocks: Block[], m: PredictedMove): boolean {
  return blocks.some(
    (b) => b.id === m.id && b.parentId === m.parentId && String(b.rank) === m.rank,
  );
}

/**
 * Does `row` already carry every field `changes` NAMES? The one comparator
 * behind both patch predicates, so "has this write landed" has a single
 * definition over the field-scoped shape — a patch can never be produced by one
 * notion of "changed" and judged by another. It reads exactly the named fields,
 * which is the hole the field scope closes: a whole-row comparison judged
 * columns the writer never claimed.
 *
 * `compareData` is the ONE axis the two callers differ on, deliberately — read
 * {@link isPatchAbsorbed} and {@link isPatchReflected} together.
 */
function fieldsReflected(
  row: Block,
  changes: BlockFieldChanges,
  compareData: boolean,
): boolean {
  if (namesField(changes, "parentId") && row.parentId !== changes.parentId) return false;
  if (namesField(changes, "type") && row.type !== changes.type) return false;
  if (namesField(changes, "rank") && String(row.rank) !== String(changes.rank)) return false;
  if (namesField(changes, "expanded") && row.expanded !== changes.expanded) return false;
  // Deep-compared with the SAME predicate the diff used to emit the change, so
  // the writer and the guard can never disagree about whether a row differs.
  if (compareData && namesField(changes, "data") && !dataEqual(row.data, changes.data)) {
    return false;
  }
  return true;
}

/** Every persisted field of a full row, as a change set (what a create asserts). */
function allFields(row: Block): BlockFieldChanges {
  return {
    parentId: row.parentId,
    type: row.type,
    rank: row.rank,
    expanded: row.expanded,
    data: row.data,
  };
}

/**
 * Shared body of the two patch predicates: every created row present and
 * matching, every update's NAMED fields landed, every deleted id gone.
 *
 * An update naming an absent row is vacuously satisfied under both: an update
 * never creates, so `applyPatch` and the server writer skip it too — applying
 * would change nothing, and the op can (must) confirm against a base without
 * the row rather than replaying forever. That is the whole of what the retired
 * `updateOnly` flag was approximating.
 */
function patchLanded(blocks: Block[], patch: BlockPatch, compareData: boolean): boolean {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const c of patch.creates) {
    const cur = byId.get(c.id);
    if (!cur) return false;
    if (!fieldsReflected(cur, allFields(c), compareData)) return false;
  }
  for (const u of patch.updates) {
    const cur = byId.get(u.id);
    if (!cur) continue;
    if (!fieldsReflected(cur, u.changes, compareData)) return false;
  }
  for (const id of patch.deleteIds) {
    if (byId.has(id)) return false;
  }
  return true;
}

/**
 * Does SERVER TRUTH prove a patch landed? True when every field the patch names
 * has landed — `data` **excluded** — and every deleted id is gone. The
 * `isConfirmedBy` predicate for the patch variant.
 *
 * `data` is excluded on purpose, and this is the confirmation half of an
 * asymmetry with {@link isPatchAbsorbed} (read both docs together). Server truth
 * legitimately differs from what the client wrote: `parseBlockData` normalizes
 * the payload at the write boundary, and a row's `data.text` trails its content
 * doc by up to ~1s (the debounced projection), so a snapshot that provably
 * contains this write can still carry different `data`. Comparing it here would
 * make ops fail to confirm, stick in the overlay, and file divergence reports.
 *
 * Being liberal is safe for confirmation and NOT safe for the apply-guard, which
 * is exactly why they are two functions.
 */
export function isPatchReflected(blocks: Block[], patch: BlockPatch): boolean {
  return patchLanded(blocks, patch, false);
}

/** Overlay a change set onto a row, touching only the fields it names. */
function mergeFields(row: Block, changes: BlockFieldChanges): Block {
  const next = { ...row };
  if (namesField(changes, "parentId")) next.parentId = changes.parentId!;
  if (namesField(changes, "type")) next.type = changes.type!;
  if (namesField(changes, "rank")) next.rank = changes.rank!;
  if (namesField(changes, "expanded")) next.expanded = changes.expanded!;
  if (namesField(changes, "data")) next.data = changes.data;
  return next;
}

/**
 * Would applying this patch to THIS base change anything? The apply-guard: when
 * true, `applyOverlayOp` throws `OpNoLongerApplies` so the replay drops the
 * entry instead of double-applying it.
 *
 * The same question as {@link isPatchReflected} asks, but about a different
 * subject — the base we are about to write, not a server snapshot we are reading
 * evidence off. So it must be EXACT, `data` included: a patch that changes only
 * `data` (a to-do's `checked`, a callout's color, an image's width — every
 * `BlockEditorAPI.update`) is a real edit, and a data-blind guard reads it as
 * already-absorbed and silently swallows it. That is not a theoretical gap: it
 * made `update` a complete no-op in `persist={false}` memory mode (whose
 * `dispatch` catches `OpNoLongerApplies` and keeps the current rows) and
 * non-optimistic on the server path.
 */
export function isPatchAbsorbed(blocks: Block[], patch: BlockPatch): boolean {
  return patchLanded(blocks, patch, true);
}

/**
 * Apply a `BlockPatch` onto a client `Block[]` base: MERGE each update's named
 * fields into its row (never a whole-row swap — an update says nothing about
 * the fields it omits), insert/replace each created row, then drop the deleted
 * ids (and any descendants of them, since the server delete cascades the
 * subtree). Ordering is by rank at render time, so we don't need to position
 * inserts — just include them. An update whose row is absent is skipped, which
 * mirrors the server writer exactly.
 */
export function applyPatch(blocks: Block[], patch: BlockPatch): Block[] {
  const createById = new Map(patch.creates.map((b) => [b.id, b]));
  const changesById = new Map(patch.updates.map((u) => [u.id, u.changes]));
  const deleted = new Set(patch.deleteIds);
  // Drop the explicitly-deleted ids plus their descendants (mirrors the server's
  // FK cascade), so an undo that re-deletes a subtree-root clears the subtree.
  //
  // The cascade reads the POST-patch parentage, which is what the server does
  // and is not a detail: `handlePatchBlocks` applies its updates BEFORE its
  // `DELETE`, so a row this patch re-parents OUT of the deleted subtree has
  // already left by the time the cascade runs. Reading pre-patch parentage here
  // instead would silently swallow exactly that shape — redoing an `unwrap`
  // (promote the children, delete the container) dropped every promoted child.
  // `namesField`, not `?? b.parentId`: a promotion to the TOP level writes
  // `parentId: null`, which `??` would silently read as "no opinion".
  const parentOf = (b: Block) => {
    const created = createById.get(b.id);
    if (created) return created.parentId;
    const changes = changesById.get(b.id);
    return changes && namesField(changes, "parentId") ? (changes.parentId ?? null) : b.parentId;
  };
  const dropped = new Set(deleted);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of blocks) {
      const parentId = parentOf(b);
      if (parentId !== null && dropped.has(parentId) && !dropped.has(b.id)) {
        dropped.add(b.id);
        grew = true;
      }
    }
  }

  const next: Block[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (dropped.has(b.id)) continue;
    // A create landing on a row that is already present is an idempotent
    // re-assert of the whole row (a replayed undo-of-delete): the create IS the
    // full state, so it wins outright. An update only merges its named fields.
    const created = createById.get(b.id);
    const changes = changesById.get(b.id);
    next.push(created ?? (changes ? mergeFields(b, changes) : b));
    seen.add(b.id);
  }
  // Append creates that weren't already present (re-created / inserted rows).
  // Updates are deliberately NOT appended: an update never creates a row, so an
  // absent target is a skip — mirroring the server writer, and the reason a
  // debounced projection flush can never resurrect a deleted block.
  for (const c of patch.creates) {
    if (!seen.has(c.id) && !dropped.has(c.id)) next.push(c);
  }
  return next;
}

/**
 * Project full `Block` rows to the reducer's JSON-pure `BlockNode` shape. The
 * only structural mismatch is `rank`: a `Block` carries a `Rank` instance while
 * a `BlockNode` carries its stored string form, so we serialize it. This lets us
 * reuse `applyBlockOp` (and its rank-sorted sibling math) on the live `rowsRef`
 * both when resolving split/merge intent client-side and when applying overlays.
 */
export function toNodes(rows: Block[]): BlockNode[] {
  return rows.map((b) => ({
    id: b.id,
    pageId: b.pageId,
    parentId: b.parentId,
    type: b.type,
    data: b.data,
    rank: String(b.rank),
    expanded: b.expanded,
  }));
}

/**
 * Reconstruct full `Block` rows from reducer output. Timestamps are preserved
 * from the matching `prev` row by id (a `new Date()` placeholder for brand-new
 * nodes is safe — the overlay value is only rendered, never re-parsed by the
 * resource schema, and the render path never reads timestamps). `rank` is wrapped
 * back into a `Rank` instance.
 */
export function fromNodes(nodes: BlockNode[], prev: Block[]): Block[] {
  const prevById = new Map(prev.map((b) => [b.id, b]));
  return nodes.map((n) => {
    const old = prevById.get(n.id);
    return {
      id: n.id,
      pageId: n.pageId,
      parentId: n.parentId,
      type: n.type,
      data: n.data,
      rank: Rank.from(n.rank),
      expanded: n.expanded,
      createdAt: old?.createdAt ?? new Date(),
      updatedAt: old?.updatedAt ?? new Date(),
    };
  });
}

/**
 * Apply one overlay op to a `Block[]` base. Idempotency guard: if the base
 * already reflects the op/patch, throw `OpNoLongerApplies` so the replay drops
 * this entry (preventing a double apply on the own-push-before-resolve window).
 * Otherwise apply: a structural `op` through the shared reducer (node adapter),
 * or a `patch` directly onto the rows.
 *
 * `anchorTypes` is the reducer's `BlockOpContext` — it MUST be the same set the
 * server passes (both derive it from their own block-handle registry), or the op
 * applies differently on each side and can never confirm. Defaulting to none is
 * byte-identical to a context-free call.
 */
export function applyOverlayOp(
  blocks: Block[],
  v: BlockOverlayOp,
  anchorTypes?: ReadonlySet<string>,
): Block[] {
  if (v.tag === "patch") {
    // `isPatchAbsorbed`, NOT the confirmation predicate: the guard asks "would
    // applying this change anything here", which includes `data` (see both docs).
    if (isPatchAbsorbed(blocks, v.patch)) throw new OpNoLongerApplies();
    return applyPatch(blocks, v.patch);
  }
  if (isReflected(blocks, v.effect)) throw new OpNoLongerApplies();
  return fromNodes(applyBlockOp(toNodes(blocks), v.op, opCtx(anchorTypes)), blocks);
}

/** `BlockOpContext` from the optional anchor-type set (`{}` when absent). */
function opCtx(anchorTypes: ReadonlySet<string> | undefined): BlockOpContext {
  return anchorTypes ? { anchorTypes } : {};
}

/**
 * Build the overlay vars for a forest-insert op (`paste`, `duplicate`). Split out
 * from `buildOverlayOp` because neither needs a current-state snapshot: the
 * effect is exactly the root ids the caller just minted (`opBlockIds`' own
 * answer for both kinds), so there is nothing to predict off the rows.
 *
 * Deliberately NOT exported — it is `buildOverlayOp`'s helper and nothing else.
 * With no exported forest-overlay builder and neither op on `BlockStore`, a paste
 * or a duplicate can only reach the pipeline through the provider's `dispatchOp`,
 * which is the one place that records an undo entry. Exporting it again re-opens
 * the bypass.
 */
function buildForestOverlayOp(
  op: Extract<BlockOp, { kind: "paste" | "duplicate" }>,
): BlockOverlayOp {
  return { tag: "op", op, effect: { kind: "create", ids: opBlockIds(op) } };
}

/** Build the overlay vars for a minimal patch (the undo/redo inverse path). */
export function buildPatchOverlayOp(patch: BlockPatch): BlockOverlayOp {
  return { tag: "patch", patch };
}

/**
 * Build the overlay op for `op`, capturing its effect from the CURRENT
 * optimistic `rows` (post prior-pending ops) — this is what makes chained ops
 * compose. `anchorTypes` must match what `applyOverlayOp` (and the server) use;
 * it is read here because the prediction runs the reducer.
 */
export function buildOverlayOp(
  op: BlockOp,
  rows: Block[],
  anchorTypes?: ReadonlySet<string>,
): BlockOverlayOp {
  switch (op.kind) {
    case "split":
    case "insert":
      // The new block is created.
      return { tag: "op", op, effect: { kind: "create", ids: [op.newId] } };
    case "paste":
    case "duplicate":
      return buildForestOverlayOp(op);
    case "merge":
      return { tag: "op", op, effect: { kind: "remove", ids: [op.blockId] } };
    case "delete":
      return { tag: "op", op, effect: { kind: "remove", ids: op.blockIds } };
    case "unwrap": {
      // The container goes away AND its children are promoted, so the effect
      // carries both. The moved set is the container's CHILDREN, which the op
      // does not name (`opBlockIds` deliberately under-approximates it), so read
      // them off the pre-op forest.
      const nodes = toNodes(rows);
      const promoted = childrenOf(nodes, op.blockId).map((c) => c.id);
      const moves = predictMoves(nodes, op, promoted, anchorTypes);
      return { tag: "op", op, effect: { kind: "unwrap", id: op.blockId, moves } };
    }
    case "indent":
    case "outdent":
    case "move":
    case "bulkMove": {
      // Run the reducer once to read where the named blocks land, then key the
      // reparent effect on their predicted parent + rank (byte-identical to the
      // server, which runs the same reducer). Blocks the reducer refused to move
      // (a bulk indent's first child, say) are left OUT of the effect: their
      // parent+rank is unchanged, so listing them would make the apply-guard
      // read the op as already-absorbed. A `bulkMove`'s `opBlockIds` is the whole
      // selection, so the same filter reduces it to the roots that really moved.
      const nodes = toNodes(rows);
      const moves = predictMoves(nodes, op, opBlockIds(op), anchorTypes);
      return { tag: "op", op, effect: { kind: "reparent", moves } };
    }
  }
}

/**
 * Where `ids` land once `op` is applied, as the reducer predicts it. Blocks that
 * did not actually move are omitted: their parent+rank is unchanged, so listing
 * them would make the apply-guard read the op as already-absorbed.
 */
function predictMoves(
  nodes: BlockNode[],
  op: BlockOp,
  ids: readonly string[],
  anchorTypes: ReadonlySet<string> | undefined,
): PredictedMove[] {
  const before = new Map(nodes.map((b) => [b.id, b]));
  const after = new Map(applyBlockOp(nodes, op, opCtx(anchorTypes)).map((b) => [b.id, b]));
  return ids.flatMap((id) => {
    const next = after.get(id);
    const prev = before.get(id);
    if (!next) return []; // vanished after apply (defensive; shouldn't happen)
    if (prev && prev.parentId === next.parentId && prev.rank === next.rank) return [];
    return [{ id, parentId: next.parentId, rank: next.rank }];
  });
}
