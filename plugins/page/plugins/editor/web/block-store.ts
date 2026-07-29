// The persistence seam for the block editor. `BlockEditorProvider` consumes a
// `BlockStore` for ALL reads/writes and is otherwise storage-agnostic: recording/
// undo, focus management, and `makeBlockAPI` never touch a store's internals.
//
// Two implementations share one shape:
//   - `useServerBlockStore`  — today's persistent path verbatim: the
//     `useOptimisticResource(blocksResource, …)` overlay + the five direct write
//     endpoints (move / bulk-delete / bulk-move / bulk-duplicate / paste).
//   - `useMemoryBlockStore`  — an authoritative in-memory `useState<Block[]>`,
//     the source of truth itself (no overlay, no confirmation, no network). Its
//     writes reuse the SAME pure helpers as the server (`applyOverlayOp`, the
//     reducer, and `core/block-forest`'s `rankWindow`/`serializeSubtree`/
//     `planForestInsert`), so op/patch/insert semantics are byte-identical.

import { useCallback, useMemo, useRef, useState } from "react";
import { fetchEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  OpNoLongerApplies,
  useOptimisticResource,
} from "@plugins/primitives/plugins/optimistic-mutation/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  selectionRoots,
  subtreeIds,
} from "@plugins/primitives/plugins/tree/core";
import {
  moveBlock,
  applyBlockOpEndpoint,
  patchBlocks,
  blocksResource,
  applyBlockOp,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  planForestInsert,
  rankWindow,
  serializeSubtree,
  withMintedIds,
  type Block,
  type BlockNode,
  type SerializedBlock,
} from "../core";
import {
  applyOverlayOp,
  buildPasteOverlayOp,
  isPatchReflected,
  isReflected,
  sameOverlayTarget,
  fromNodes,
  toNodes,
  type BlockOverlayOp,
} from "./internal/optimistic-block-ops";
import { useAnchorTypes } from "./internal/block-handles";

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

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
 * op + patch pipeline (structural keystrokes and undo/redo); the remaining five
 * are the direct write paths that bypass the reducer. Recording for undo stays in
 * the provider — a store only applies/persists.
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
  /** Duplicate each selection root in place; resolves to the new root ids. */
  bulkDuplicate: (ids: string[]) => Promise<string[]>;
  /** Insert a serialized forest after `afterId` (or under `parentId`). */
  paste: (args: {
    blocks: SerializedBlock[];
    afterId: string | null;
    parentId?: string | null;
  }) => Promise<string[]>;
}

/**
 * Paste, for EITHER store. A paste is a `BlockOp` like every other structural
 * edit, so both implementations reduce to "mint the forest's ids, dispatch the
 * op" and there is nothing left to diverge on.
 *
 * That is the whole point of the op form: the forest's identities are minted
 * HERE, client-side, so the overlay can render the pasted blocks on the
 * keystroke and the eventual server push is a confirmation rather than the
 * first time the user sees their content. Before this, paste was the only
 * editor mutation that POSTed and waited — a 25-block paste took ~600-800ms to
 * show anything and froze the main thread for ~500ms while the push mounted
 * every new block at once.
 *
 * `parentId` defaults to the PAGE's own id, not null: the reducer's forest
 * excludes the page row, so the page id is how "the content top level" is
 * addressed (see the `paste` op's `parentId` doc). Only a store knows its page.
 *
 * Resolves synchronously — the root ids are the ones just minted, not something
 * the server has to hand back.
 */
function pasteThroughOps(
  dispatch: (v: BlockOverlayOp) => void,
  pageId: string,
  args: {
    blocks: SerializedBlock[];
    afterId: string | null;
    parentId?: string | null;
  },
): Promise<string[]> {
  const forest = withMintedIds(args.blocks);
  if (forest.length === 0) return Promise.resolve([]);
  dispatch(
    buildPasteOverlayOp({
      kind: "paste",
      forest,
      afterId: args.afterId,
      parentId: args.parentId ?? pageId,
    }),
  );
  return Promise.resolve(forest.map((n) => n.id));
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
    // overlay + freeze pipeline (and confirmation) is shared.
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

  const bulkDuplicate = useCallback(
    async (ids: string[]): Promise<string[]> => {
      const { rootIds } = await fetchEndpoint(
        bulkDuplicateBlocks,
        { pageId },
        { body: { ids } },
      );
      return rootIds;
    },
    [pageId],
  );

  const paste = useCallback(
    (args: {
      blocks: SerializedBlock[];
      afterId: string | null;
      parentId?: string | null;
    }): Promise<string[]> => pasteThroughOps(dispatch, pageId, args),
    [dispatch, pageId],
  );

  return {
    data: optimistic.data,
    serverData: optimistic.serverData,
    pending: optimistic.pending,
    dispatch,
    move,
    bulkDelete,
    bulkMove,
    bulkDuplicate,
    paste,
  };
}

// ---------------------------------------------------------------------------
// In-memory store (authoritative, synchronous, no network).
// ---------------------------------------------------------------------------

export function useMemoryBlockStore({
  pageId,
  initialBlocks,
}: {
  pageId: string;
  initialBlocks: Block[];
}): BlockStore {
  const [rows, setRowsState] = useState<Block[]>(initialBlocks);
  // The authoritative rows are also mirrored into a ref updated synchronously by
  // every write, so (a) writes chained within one event compose against the
  // latest truth (not a stale render snapshot), and (b) `bulkDuplicate`/`paste`
  // can resolve their new root ids SYNCHRONOUSLY — a `useState` updater runs on a
  // later render, so reading the ids "after `setRows`" would read the pre-write
  // value. Never mint ids inside the updater; compute, commit, then return.
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
      const roots = selectionRoots(cur, new Set(args.ids));
      if (roots.length === 0) return;
      const nodes = toNodes(cur);
      // Rank window under the destination parent, excluding everything moving so
      // the moved roots don't bound their own insertion window.
      const movingSubtree = new Set(roots.flatMap((r) => subtreeIds(cur, r)));
      const [prev, next] = rankWindow(nodes, args.parentId, args.afterId, movingSubtree);
      const ranks = Rank.nBetween(prev, next, roots.length);
      const rankById = new Map(roots.map((r, i) => [r, ranks[i]!] as const));
      // Single synthetic page → no cross-page pageId recompute needed.
      commit(
        cur.map((b) => {
          if (rankById.has(b.id)) {
            return { ...b, parentId: args.parentId, rank: rankById.get(b.id)! };
          }
          // Open the destination parent so the moved blocks are visible (mirrors
          // the server's expand-on-drop).
          if (args.parentId !== null && b.id === args.parentId) {
            return { ...b, expanded: true };
          }
          return b;
        }),
      );
    },
    [commit],
  );

  const bulkDuplicate = useCallback(
    (ids: string[]): Promise<string[]> => {
      const cur = rowsRef.current;
      const roots = selectionRoots(cur, new Set(ids));
      if (roots.length === 0) return Promise.resolve([]);
      const nodes = toNodes(cur);
      const newNodes: BlockNode[] = [];
      const rootIds: string[] = [];
      for (const rootId of roots) {
        const root = nodes.find((n) => n.id === rootId);
        if (!root) continue;
        // Clone lands immediately after the original, between it and its next
        // sibling. Windows are computed from the ORIGINAL nodes (clones aren't in
        // `nodes`), so duplicating adjacent siblings never collides — exactly the
        // server's `insertForest` positioning.
        const [prev, next] = rankWindow(nodes, root.parentId, root.id, EMPTY_IDS);
        const plan = planForestInsert({
          pageId: root.pageId,
          parentId: root.parentId,
          rootRanks: Rank.nBetween(prev, next, 1),
          forest: withMintedIds([serializeSubtree(nodes, rootId)]),
        });
        newNodes.push(...plan.nodes);
        rootIds.push(...plan.rootIds);
      }
      commit([...cur, ...fromNodes(newNodes, cur)]);
      return Promise.resolve(rootIds);
    },
    [commit],
  );

  // Byte-identical to the server store's paste: the SAME op through the SAME
  // reducer, differing only in that `dispatch` here writes state synchronously
  // instead of overlaying + POSTing.
  const paste = useCallback(
    (args: {
      blocks: SerializedBlock[];
      afterId: string | null;
      parentId?: string | null;
    }): Promise<string[]> => pasteThroughOps(dispatch, pageId, args),
    [dispatch, pageId],
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
    bulkDuplicate,
    paste,
  };
}
