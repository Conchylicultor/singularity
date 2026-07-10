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
import { applyBlockOp, opBlockIds, type BlockNode, type BlockOp, type BlockPatch } from "../../core";
import type { Block } from "../../core";

/**
 * A compact fingerprint of what an op produces, captured at dispatch against the
 * current optimistic state. `isReflected` reuses it for both the apply-guard and
 * confirmation, so client prediction and server truth are compared with one
 * predicate. `reparent` keys on parent AND rank so a same-parent reorder isn't
 * falsely judged already-applied.
 */
export type OpEffect =
  | { kind: "create"; id: string } // split, insert → newId appears
  | { kind: "remove"; id: string } // merge, delete → blockId disappears
  // indent/outdent/move → every listed block sits at its predicted parent+rank.
  // A list, not one id: indent/outdent are set operations (a single Tab is the
  // one-element case). Only blocks that ACTUALLY moved are listed, so an op the
  // reducer partially refused still confirms on exactly what it did.
  | { kind: "reparent"; moves: { id: string; parentId: string | null; rank: string }[] };

/**
 * The overlay `Vars` carried by `useOptimisticResource`. Two variants share the
 * one `useOptimisticResource` instance so structural ops AND undo/redo patches
 * flow through the same overlay/replay + freeze pipeline:
 *
 *  - `op` — a single `BlockOp` applied through the shared `applyBlockOp` reducer
 *    (the forward keystroke/structural edits). Confirmed by its `OpEffect`.
 *  - `patch` — a minimal `BlockPatch` (upsert rows + delete ids) applied
 *    directly onto the client `Block[]` (the undo/redo inverse path). Confirmed
 *    when every upsert is reflected and every deleted id is absent.
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
    return [...v.patch.upserts.map((b) => b.id), ...v.patch.deleteIds];
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
    case "create":
      return blocks.some((b) => b.id === e.id);
    case "remove":
      return !blocks.some((b) => b.id === e.id);
    case "reparent":
      // `moves` is never empty (a no-op op is never dispatched — `dispatchOp`
      // drops it), so this is not vacuously true.
      return e.moves.every((m) =>
        blocks.some(
          (b) => b.id === m.id && b.parentId === m.parentId && String(b.rank) === m.rank,
        ),
      );
  }
}

/**
 * Has `blocks` fully absorbed a patch? True when every upserted row is present
 * with matching persisted columns AND every deleted id is gone. Used for both
 * the patch apply-guard (skip a replay that the base already reflects) and
 * content-based confirmation on a fresh server snapshot.
 */
export function isPatchReflected(blocks: Block[], patch: BlockPatch): boolean {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const up of patch.upserts) {
    const cur = byId.get(up.id);
    if (!cur) {
      // Update-only upsert onto a row that no longer exists: vacuously
      // absorbed — the server writer skipped it too (never resurrects), so
      // this op can and must confirm against a base without the row.
      if (patch.updateOnly) continue;
      return false;
    }
    if (
      cur.parentId !== up.parentId ||
      cur.type !== up.type ||
      String(cur.rank) !== String(up.rank) ||
      cur.expanded !== up.expanded
    ) {
      return false;
    }
  }
  for (const id of patch.deleteIds) {
    if (byId.has(id)) return false;
  }
  return true;
}

/**
 * Apply a `BlockPatch` onto a client `Block[]` base: replace/insert each upsert
 * by id, then drop the deleted ids (and any descendants of them, since the
 * server delete cascades the subtree). Ordering is by rank at render time, so we
 * don't need to position inserts — just include them.
 */
export function applyPatch(blocks: Block[], patch: BlockPatch): Block[] {
  const upsertById = new Map(patch.upserts.map((b) => [b.id, b]));
  const deleted = new Set(patch.deleteIds);
  // Drop the explicitly-deleted ids plus their descendants (mirrors the server's
  // FK cascade), so an undo that re-deletes a subtree-root clears the subtree.
  const dropped = new Set(deleted);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of blocks) {
      if (b.parentId !== null && dropped.has(b.parentId) && !dropped.has(b.id)) {
        dropped.add(b.id);
        grew = true;
      }
    }
  }

  const next: Block[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (dropped.has(b.id)) continue;
    const up = upsertById.get(b.id);
    next.push(up ?? b);
    seen.add(b.id);
  }
  // Append any upserts that weren't already present (re-created / inserted
  // rows) — unless the patch is update-only, which never creates rows (the
  // absent row was deleted out from under it; mirrors the server writer).
  if (!patch.updateOnly) {
    for (const up of patch.upserts) {
      if (!seen.has(up.id) && !dropped.has(up.id)) next.push(up);
    }
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
 */
export function applyOverlayOp(blocks: Block[], v: BlockOverlayOp): Block[] {
  if (v.tag === "patch") {
    if (isPatchReflected(blocks, v.patch)) throw new OpNoLongerApplies();
    return applyPatch(blocks, v.patch);
  }
  if (isReflected(blocks, v.effect)) throw new OpNoLongerApplies();
  return fromNodes(applyBlockOp(toNodes(blocks), v.op), blocks);
}

/** Build the overlay vars for a minimal patch (the undo/redo inverse path). */
export function buildPatchOverlayOp(patch: BlockPatch): BlockOverlayOp {
  return { tag: "patch", patch };
}

/**
 * Build the overlay op for `op`, capturing its effect from the CURRENT
 * optimistic `rows` (post prior-pending ops) — this is what makes chained ops
 * compose.
 */
export function buildOverlayOp(op: BlockOp, rows: Block[]): BlockOverlayOp {
  switch (op.kind) {
    case "split":
    case "insert":
      // The new block is created.
      return { tag: "op", op, effect: { kind: "create", id: op.newId } };
    case "merge":
    case "delete":
      return { tag: "op", op, effect: { kind: "remove", id: op.blockId } };
    case "indent":
    case "outdent":
    case "move": {
      // Run the reducer once to read where the named blocks land, then key the
      // reparent effect on their predicted parent + rank (byte-identical to the
      // server, which runs the same reducer). Blocks the reducer refused to move
      // (a bulk indent's first child, say) are left OUT of the effect: their
      // parent+rank is unchanged, so listing them would make the apply-guard
      // read the op as already-absorbed.
      const nodes = toNodes(rows);
      const before = new Map(nodes.map((b) => [b.id, b]));
      const after = new Map(applyBlockOp(nodes, op).map((b) => [b.id, b]));
      const moves = opBlockIds(op).flatMap((id) => {
        const next = after.get(id);
        const prev = before.get(id);
        if (!next) return []; // vanished after apply (defensive; shouldn't happen)
        if (prev && prev.parentId === next.parentId && prev.rank === next.rank) return [];
        return [{ id, parentId: next.parentId, rank: next.rank }];
      });
      return { tag: "op", op, effect: { kind: "reparent", moves } };
    }
  }
}
