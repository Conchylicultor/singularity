// The persistence seam for the block editor. `BlockEditorProvider` consumes a
// `BlockStore` for ALL reads/writes and is otherwise storage-agnostic: recording/
// undo, focus management, and `makeBlockAPI` never touch a store's internals.
//
// Two implementations share one shape:
//   - `useServerBlockStore`  — today's persistent path verbatim: the
//     `useOptimisticResource(blocksResource, …)` overlay + the three direct write
//     endpoints (move / bulk-delete / bulk-move).
//   - `useMemoryBlockStore`  — an authoritative in-memory `useState<Block[]>`,
//     the source of truth itself (no overlay, no confirmation, no network). Its
//     writes reuse the SAME pure helpers as the server (`applyOverlayOp`, the
//     reducer, `planBulkMove`), so op/patch/insert/move semantics are
//     byte-identical.

import { useCallback, useMemo, useRef, useState } from "react";
import { fetchEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  OpNoLongerApplies,
  useOptimisticResource,
} from "@plugins/primitives/plugins/optimistic-mutation/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { subtreeIds } from "@plugins/primitives/plugins/tree/core";
import {
  moveBlock,
  applyBlockOpEndpoint,
  patchBlocks,
  blocksResource,
  applyBlockOp,
  applyBulkMove,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  planBulkMove,
  type Block,
} from "../core";
import {
  applyOverlayOp,
  isPatchReflected,
  isReflected,
  sameOverlayTarget,
  fromNodes,
  toNodes,
  type BlockOverlayOp,
} from "./internal/optimistic-block-ops";
import { useAnchorTypes } from "./internal/block-handles";

/**
 * Where a single-block `move` lands, as the provider resolved it over the
 * complete forest (`computeDrop`).
 *
 * The two halves are NOT redundant. `parentId` + the positional `targetId`/`zone`
 * are the WIRE contract (`MoveBlockBody`): no caller may hand the server a rank,
 * because `page_blocks` has one ordering space that several live resources
 * project disjointly, so only the server sees the true sibling set. `rank` is the
 * provider's local PREDICTION of the resulting key — it drives the optimistic
 * overlay and the undo record on the server path, and it IS the truth on the
 * memory path, whose store is its own rank authority over a forest it holds
 * whole.
 */
export interface BlockMoveDest {
  parentId: string | null;
  rank: Rank;
  targetId: string;
  zone: "before" | "after";
}

/**
 * The full read/write surface the provider needs. `dispatch` covers the overlay
 * op + patch pipeline (structural keystrokes and undo/redo); the remaining three
 * are the direct write paths that bypass the reducer. Recording for undo stays in
 * the provider — a store only applies/persists.
 *
 * There is deliberately NO `paste` and no `bulkDuplicate` member: both are
 * `BlockOp`s, so `dispatch` is their only home. Both used to have one, and that
 * is precisely how they reached the pipeline without passing the provider's
 * `dispatchOp` — the one place that records an undo entry. Anything expressible
 * as a `BlockOp` belongs on `dispatch`; a new member here is a claim that it is
 * not.
 */
export interface BlockStore {
  /** Current document rows (server truth + overlay, or the in-memory truth). */
  data: Block[];
  /**
   * AUTHORITATIVE rows with NO optimistic overlay — the raw resource base on the
   * server path, the in-memory truth on the memory path. The provider derives
   * `serverIds` from it (the doc-init FK gate, Stage 4a): a freshly created /
   * split block is in `data` (overlay) before its row lands here. In memory
   * every row is authoritative from the start, so `serverData === data`.
   */
  serverData: Block[];
  /** True until the first authoritative snapshot arrives (memory: never). */
  pending: boolean;
  /** Apply a structural op / undo-redo patch through the overlay pipeline. */
  dispatch: (v: BlockOverlayOp) => void;
  /** Move a single block to the resolved destination (see {@link BlockMoveDest}). */
  move: (id: string, dest: BlockMoveDest) => void;
  /** Delete each id's full subtree. */
  bulkDelete: (ids: string[]) => void;
  /** Reparent a selection's roots under `parentId`, positioned after `afterId`. */
  bulkMove: (args: { ids: string[]; parentId: string | null; afterId: string | null }) => void;
}

// ---------------------------------------------------------------------------
// Server-backed store (the persistent path — extracted verbatim).
// ---------------------------------------------------------------------------

export function useServerBlockStore(pageId: string): BlockStore {
  // Structural keystroke ops apply optimistically: the client runs the SAME
  // `applyBlockOp` reducer the server runs, overlaid on live-state truth and
  // reconciled by the WS push. The captured `effect` drives both the idempotency
  // apply-guard (in `applyOverlayOp`) and content-based confirmation here.
  const params = useMemo(() => ({ pageId }), [pageId]);
  // The reducer's type facts, derived from the block-handle registry. The SERVER
  // derives the same set from its own registry and passes it to the same
  // `applyBlockOp`; if the two ever disagreed, an op would predict one forest
  // here and commit another there, and could never confirm.
  const anchorTypes = useAnchorTypes();
  // The tail of this page's serialized write queue (see `mutate` below).
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const apply = useCallback(
    (blocks: Block[], v: BlockOverlayOp) => applyOverlayOp(blocks, v, anchorTypes),
    [anchorTypes],
  );
  const optimistic = useOptimisticResource<Block[], BlockOverlayOp, { pageId: string }>({
    resource: blocksResource,
    params,
    apply,
    // Structural ops keep their own `op` endpoint; undo/redo patches POST to the
    // generic `patch` endpoint. Both flow through this one instance so the
    // overlay + freeze pipeline (and confirmation) is shared.
    // SERIALIZED per page, in dispatch order. These writes are causally
    // dependent — a `convertTo` patch turns a block into a bullet and the split
    // that follows inherits that type; an `indent` op moves a block the next
    // split then reads — but they are independent POSTs, so the browser is free
    // to deliver them in either order and the server applied them as they
    // landed. Captured in the wild: `split` arriving before the `convertTo` it
    // depended on, so the tail inherited `text` and the user's bullet silently
    // reverted one push later.
    //
    // A human never hit it because they pause between structural edits; the
    // caret authority replays a buffered burst with no pauses at all, so the
    // chain is now routine. The overlay renders every op instantly regardless
    // (never-revert), so the queue costs the USER nothing — only the wire order
    // is constrained, which is the one thing that was wrong.
    //
    // The chain is failure-proof: a rejected write must not wedge the queue, so
    // the successor runs either way while `mutate` still returns the true
    // outcome for THIS write (the primitive's classification/retry is untouched).
    mutate: (v) => {
      const send = () =>
        v.tag === "patch"
          ? fetchEndpoint(patchBlocks, { pageId }, { body: v.patch }).then((r) => ({
              watermark: r.watermark,
            }))
          : fetchEndpoint(applyBlockOpEndpoint, { pageId }, { body: v.op }).then((r) => ({
              watermark: r.watermark,
            }));
      const sent = writeChainRef.current.then(send, send);
      writeChainRef.current = sent.then(
        () => undefined,
        () => undefined,
      );
      return sent;
    },
    isConfirmedBy: (serverData, v) =>
      v.tag === "patch"
        ? isPatchReflected(serverData, v.patch)
        : isReflected(serverData, v.effect),
    // Op identity for cascade confirmation: only a newer confirmed op writing
    // the SAME block row(s) may supersede an older resolved one, so an inverse
    // undo/redo pair (shared id set) cascades while an unrelated block's
    // confirmation can never drop another block's still-pending write (e.g. a
    // `projectText` projection patch). See the editor CLAUDE.md.
    sameTarget: sameOverlayTarget,
    // Bounded op summary for the divergence report (raw `vars` is never shipped).
    describeOp: (v) => (v.tag === "patch" ? "patch" : v.op.kind),
  });

  const { mutate: bulkDeleteMutation } = useEndpointMutation(bulkDeleteBlocks);

  const dispatch = useCallback(
    (v: BlockOverlayOp) => optimistic.dispatch(v),
    [optimistic],
  );

  const move = useCallback((id: string, dest: BlockMoveDest) => {
    // Positional intent only — the server mints the rank against the true
    // sibling set; `dest.rank` was the provider's overlay prediction and never
    // goes over the wire.
    // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: DnD parent/position write; blocksResource push re-renders, drag again to fix.
    void fetchEndpoint(
      moveBlock,
      { id },
      { body: { parentId: dest.parentId, targetId: dest.targetId, zone: dest.zone } },
    );
  }, []);

  const bulkDelete = useCallback(
    (ids: string[]) => {
      bulkDeleteMutation({ params: { pageId }, body: { ids } });
    },
    [pageId, bulkDeleteMutation],
  );

  const bulkMove = useCallback(
    (args: { ids: string[]; parentId: string | null; afterId: string | null }) => {
      // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: DnD bulk-move rank write; blocksResource push re-renders, drag again to fix.
      void fetchEndpoint(bulkMoveBlocks, { pageId }, { body: args });
    },
    [pageId],
  );

  return {
    data: optimistic.data,
    serverData: optimistic.serverData,
    pending: optimistic.pending,
    dispatch,
    move,
    bulkDelete,
    bulkMove,
  };
}

// ---------------------------------------------------------------------------
// In-memory store (authoritative, synchronous, no network).
// ---------------------------------------------------------------------------

// Takes no `pageId`: the memory document is one synthetic page whose rows already
// carry it, and the only write that ever needed the page's own id was `paste`
// (now the provider's, which knows it).
export function useMemoryBlockStore({ initialBlocks }: { initialBlocks: Block[] }): BlockStore {
  const [rows, setRowsState] = useState<Block[]>(initialBlocks);
  // The authoritative rows are also mirrored into a ref updated synchronously by
  // every write, so writes chained within one event compose against the latest
  // truth rather than a stale render snapshot.
  const rowsRef = useRef<Block[]>(initialBlocks);
  // Same reducer facts as the server path — an in-memory document must apply an
  // op exactly as a persisted one does (see `useServerBlockStore`).
  const anchorTypes = useAnchorTypes();
  const commit = useCallback((next: Block[]) => {
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  const dispatch = useCallback(
    (v: BlockOverlayOp) => {
      // Byte-identical op/patch semantics to the server (same reducer). The overlay
      // apply-guard throws `OpNoLongerApplies` when the base already reflects the
      // op/patch — in memory that means a no-op replay, so keep the current rows.
      try {
        commit(applyOverlayOp(rowsRef.current, v, anchorTypes));
      } catch (err) {
        if (err instanceof OpNoLongerApplies) return;
        throw err;
      }
    },
    [commit, anchorTypes],
  );

  const move = useCallback(
    (id: string, dest: BlockMoveDest) => {
      // This store IS the rank authority (no server to mint one), and it holds
      // the page's forest whole — so the provider's predicted `dest.rank`, taken
      // over those same rows, is the authoritative key. `targetId`/`zone` are the
      // wire's business and are unused here.
      const cur = rowsRef.current;
      commit(
        fromNodes(
          applyBlockOp(
            toNodes(cur),
            {
              kind: "move",
              blockId: id,
              parentId: dest.parentId,
              rank: dest.rank.toJSON(),
            },
            { anchorTypes },
          ),
          cur,
        ),
      );
    },
    [commit, anchorTypes],
  );

  const bulkDelete = useCallback(
    (ids: string[]) => {
      const cur = rowsRef.current;
      // Mirror the server cascade: drop each id's full subtree.
      const removed = new Set(ids.flatMap((id) => subtreeIds(cur, id)));
      commit(cur.filter((b) => !removed.has(b.id)));
    },
    [commit],
  );

  const bulkMove = useCallback(
    (args: { ids: string[]; parentId: string | null; afterId: string | null }) => {
      const cur = rowsRef.current;
      // The SAME planner the server writer and the provider's undo prediction
      // run. Sharing it is a correctness requirement, not DRY: the provider
      // records its undo patch off `applyBulkMove`'s output, so any divergence
      // here would make that patch describe a state this store never reached.
      // It also brings the cycle guard and the document ordering the hand-rolled
      // algebra here lacked. Single synthetic page → no `pageId` recompute.
      const plan = planBulkMove(toNodes(cur), args);
      if (plan.refusal) return;
      commit(fromNodes(applyBulkMove(toNodes(cur), plan), cur));
    },
    [commit],
  );

  return {
    data: rows,
    // Every in-memory row is authoritative from the start (no overlay), so the
    // doc-init FK gate is a no-op — `serverIds` covers all blocks.
    serverData: rows,
    pending: false,
    dispatch,
    move,
    bulkDelete,
    bulkMove,
  };
}
