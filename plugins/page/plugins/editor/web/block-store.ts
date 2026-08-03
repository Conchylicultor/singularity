// The persistence seam for the block editor. `BlockEditorProvider` consumes a
// `BlockStore` for ALL reads/writes and is otherwise storage-agnostic: recording/
// undo, focus management, and `makeBlockAPI` never touch a store's internals.
//
// Two implementations share one shape:
//   - `useServerBlockStore`  — the persistent path: the
//     `useOptimisticResource(blocksResource, …)` overlay, and nothing else.
//   - `useMemoryBlockStore`  — an authoritative in-memory `useState<Block[]>`,
//     the source of truth itself (no overlay, no confirmation, no network). Its
//     writes reuse the SAME pure helpers as the server (`applyOverlayOp`, the
//     reducer), so op/patch semantics are byte-identical.

import { useCallback, useMemo, useRef, useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  OpNoLongerApplies,
  useOptimisticResource,
} from "@plugins/primitives/plugins/optimistic-mutation/web";
import {
  applyBlockOpEndpoint,
  patchBlocks,
  blocksResource,
  type Block,
} from "../core";
import {
  applyOverlayOp,
  isPatchReflected,
  isReflected,
  sameOverlayTarget,
  type BlockOverlayOp,
} from "./internal/optimistic-block-ops";
import { useAnchorTypes } from "./internal/block-handles";

/**
 * The full read/write surface the provider needs. Recording for undo stays in
 * the provider — a store only applies/persists.
 *
 * `dispatch` is the ONLY write member, and that is the invariant, not a
 * coincidence: every structural mutation the editor can make is a `BlockOp` (or
 * the undo/redo `BlockPatch`), so every one of them flows through the same
 * overlay, the same reducer and the same ordered send lane. `paste`,
 * `bulkDuplicate`, `move`, `bulkDelete` and `bulkMove` each used to have a member
 * here, and that is precisely how they reached the network without passing the
 * provider's `dispatchOp` — the one place that records an undo entry — and
 * without joining the page's write order. A new member here would be a claim
 * that some mutation is not expressible as an op; there are none left.
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
    // overlay + freeze pipeline (and confirmation) is shared — and so both ride
    // the primitive's per-`(resource, params)` send lane, which is what keeps
    // causally dependent writes in issue order on the wire.
    mutate: (v) =>
      v.tag === "patch"
        ? fetchEndpoint(patchBlocks, { pageId }, { body: v.patch }).then((r) => ({
            watermark: r.watermark,
          }))
        : fetchEndpoint(applyBlockOpEndpoint, { pageId }, { body: v.op }).then((r) => ({
            watermark: r.watermark,
          })),
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

  const dispatch = useCallback(
    (v: BlockOverlayOp) => optimistic.dispatch(v),
    [optimistic],
  );

  return {
    data: optimistic.data,
    serverData: optimistic.serverData,
    pending: optimistic.pending,
    dispatch,
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

  return {
    data: rows,
    // Every in-memory row is authoritative from the start (no overlay), so the
    // doc-init FK gate is a no-op — `serverIds` covers all blocks.
    serverData: rows,
    pending: false,
    dispatch,
  };
}
