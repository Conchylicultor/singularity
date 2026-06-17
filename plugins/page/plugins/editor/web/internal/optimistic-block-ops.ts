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
import { applyBlockOp, type BlockNode, type BlockOp, type BlockPatch } from "../../core";
// `prevSibling` is a same-plugin helper not re-exported from the editor's public
// barrel (it stays plugin-internal); import it directly from the source, mirroring
// how the server's handle-apply-block-op reaches into `core/block-ops`.
import { prevSibling } from "../../core/block-ops";
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
  | { kind: "reparent"; id: string; parentId: string | null; rank: string }; // indent/outdent/move

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
 *
 * `textOwners` are the block ids whose TEXT this overlay rewrites (frozen against
 * autosave while in flight) — the op's text-bearing blocks, or for a patch the
 * upserted ids (their stored content is being restored authoritatively).
 */
export type BlockOverlayOp =
  | { tag: "op"; op: BlockOp; effect: OpEffect; textOwners: string[] }
  | { tag: "patch"; patch: BlockPatch; textOwners: string[] };

/** Has `blocks` already absorbed `e`? Single predicate for guard + confirmation. */
export function isReflected(blocks: Block[], e: OpEffect): boolean {
  switch (e.kind) {
    case "create":
      return blocks.some((b) => b.id === e.id);
    case "remove":
      return !blocks.some((b) => b.id === e.id);
    case "reparent":
      return blocks.some(
        (b) =>
          b.id === e.id &&
          b.parentId === e.parentId &&
          String(b.rank) === e.rank,
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
    if (
      !cur ||
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
  // Append any upserts that weren't already present (re-created / inserted rows).
  for (const up of patch.upserts) {
    if (!seen.has(up.id) && !dropped.has(up.id)) next.push(up);
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
  return { tag: "patch", patch, textOwners: patch.upserts.map((b) => b.id) };
}

/**
 * Build the overlay op for `op`, capturing its effect + textOwners from the
 * CURRENT optimistic `rows` (post prior-pending ops) — this is what makes chained
 * ops compose. See the plan's op→(effect, textOwners) table.
 */
export function buildOverlayOp(op: BlockOp, rows: Block[]): BlockOverlayOp {
  switch (op.kind) {
    case "split":
      // The new block is created; the origin block's text is truncated.
      return { tag: "op", op, effect: { kind: "create", id: op.newId }, textOwners: [op.blockId] };
    case "insert":
      // The new block is created and empty — no text owner to freeze.
      return { tag: "op", op, effect: { kind: "create", id: op.newId }, textOwners: [] };
    case "merge": {
      // The block is removed; its text concatenates into the prev sibling, whose
      // text therefore grows — freeze both.
      const nodes = toNodes(rows);
      const block = nodes.find((b) => b.id === op.blockId);
      const prev = block ? prevSibling(nodes, block) : null;
      const textOwners = prev ? [op.blockId, prev.id] : [op.blockId];
      return { tag: "op", op, effect: { kind: "remove", id: op.blockId }, textOwners };
    }
    case "delete":
      return { tag: "op", op, effect: { kind: "remove", id: op.blockId }, textOwners: [] };
    case "indent":
    case "outdent":
    case "move": {
      // Run the reducer once to read where the moved node lands, then key the
      // reparent effect on its predicted parent + rank (byte-identical to the
      // server, which runs the same reducer).
      const nodes = toNodes(rows);
      const next = applyBlockOp(nodes, op);
      const moved = next.find((b) => b.id === op.blockId);
      if (moved) {
        return {
          tag: "op",
          op,
          effect: { kind: "reparent", id: op.blockId, parentId: moved.parentId, rank: moved.rank },
          textOwners: [],
        };
      }
      // Defensive: the node vanished after apply (shouldn't happen). Fall back to
      // the block's current parent/rank so the op still dispatches as a near no-op.
      const cur = nodes.find((b) => b.id === op.blockId);
      return {
        tag: "op",
        op,
        effect: {
          kind: "reparent",
          id: op.blockId,
          parentId: cur?.parentId ?? null,
          rank: cur?.rank ?? "",
        },
        textOwners: [],
      };
    }
  }
}
