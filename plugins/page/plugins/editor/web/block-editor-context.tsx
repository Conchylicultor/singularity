import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { fetchEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { useUndoRedo } from "@plugins/primitives/plugins/undo-redo/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { subtreeIds } from "@plugins/primitives/plugins/tree/core";
import {
  moveBlock,
  applyBlockOpEndpoint,
  patchBlocks,
  blocksResource,
  prevVisibleLeaf,
  runsOfNode,
  applyBlockOp,
  diffBlocks,
  patchesFromDiff,
  isEmptyPatch,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
  type Block,
  type BlockOp,
  type BlockPatch,
  type RichText,
  type SerializedBlock,
} from "../core";
import {
  appendRunsToBlockDoc,
  captureBlockDocEdit,
  truncateBlockDocFrom,
  type CapturedBlockDocEdit,
} from "./internal/use-collab-block-doc";
import {
  applyOverlayOp,
  buildOverlayOp,
  buildPatchOverlayOp,
  isReflected,
  isPatchReflected,
  sameOverlayTarget,
  toNodes,
  fromNodes,
  type BlockOverlayOp,
} from "./internal/optimistic-block-ops";
import type { BlockEditorAPI } from "./types";

/** Human labels for the structural-undo history (tooltips / menus). */
const OP_LABELS: Record<BlockOp["kind"], string> = {
  insert: "Insert block",
  delete: "Delete block",
  split: "Split block",
  merge: "Merge blocks",
  indent: "Indent block",
  outdent: "Outdent block",
  move: "Move block",
};

/** The block id the user is "on" for an op, used to restore focus on undo/redo. */
function opFocusId(op: BlockOp): string {
  switch (op.kind) {
    case "insert":
    case "split":
      return op.newId;
    case "merge":
    case "delete":
    case "indent":
    case "outdent":
    case "move":
      return op.blockId;
  }
}

/** Run the pure reducer over full rows and project back to `Block[]`. */
function fromOpResult(before: Block[], op: BlockOp): Block[] {
  return fromNodes(applyBlockOp(toNodes(before), op), before);
}

/**
 * Shared before→after derivation for the two structural recorders
 * (`recordPatchEntry` and `recordStructuralWithDocEdit`): diff the two full-row
 * snapshots into a minimal forward/reverse `BlockPatch` pair, splice the optional
 * `undoTextOverride` into the reverse patch's upserts (no-op when undefined — pins
 * a restored row's `data.text` to LIVE runs captured at op time, used by merge),
 * and derive the per-direction focus targets. Returns `null` when BOTH patches are
 * empty; the caller decides whether that is a full bail (patch-only entry) or a
 * still-record (a docEdit-only entry). Redo keeps the `focusId` the user was on;
 * undo PREFERS the block the reverse patch restores (`undoPatch.upserts[0]`) over
 * `focusId` — undoing a split deletes the new block, so landing focus on it would
 * drop focus to <body>, whereas the reverse upsert is the surviving block — falling
 * back to `focusId` then the forward upsert so every op still lands somewhere sane.
 */
function derivePatchEntry(
  before: Block[],
  after: Block[],
  focusId: string | null,
  undoTextOverride?: { blockId: string; runs: RichText },
): {
  undoPatch: BlockPatch;
  redoPatch: BlockPatch;
  undoFocus: string | null;
  redoFocus: string | null;
} | null {
  const patches = patchesFromDiff(diffBlocks(before, after));
  const redoPatch = patches.redo;
  let undoPatch = patches.undo;
  if (undoTextOverride) {
    undoPatch = {
      ...undoPatch,
      upserts: undoPatch.upserts.map((b) =>
        b.id === undoTextOverride.blockId
          ? {
              ...b,
              data: {
                ...((b.data as Record<string, unknown> | null) ?? {}),
                text: undoTextOverride.runs,
              },
            }
          : b,
      ),
    };
  }
  if (isEmptyPatch(undoPatch) && isEmptyPatch(redoPatch)) return null;
  const redoFocus = focusId ?? redoPatch.upserts[0]?.id ?? null;
  const undoFocus = undoPatch.upserts[0]?.id ?? focusId ?? null;
  return { undoPatch, redoPatch, undoFocus, redoFocus };
}

/**
 * A block's focus capabilities, registered by its renderer. Every focusable
 * block provides `focus`; text editors additionally provide caret-precise
 * placement so the coordinator can land the caret at a pixel column or boundary.
 * Void/textarea blocks (divider, code) register `focus` only.
 */
export interface BlockFocusHandle {
  /** Focus the block's editor, restoring its last selection. */
  focus: () => void;
  /** Place the caret at viewport column `x` on the block's top/bottom visual line. */
  focusAtColumn?: (x: number, edge: "top" | "bottom") => void;
  /** Collapse the caret to the block's very start/end. */
  focusBoundary?: (edge: "start" | "end") => void;
  /** Place the caret at a linear character offset (the merge join point). */
  focusOffset?: (offset: number) => void;
  /**
   * Content surgery (registered by text editors, whose Lexical instance is
   * bound to the block's per-block content doc): delete the LIVE content from
   * linear `offset` to the end. Enter-split uses it to leave the head in the
   * origin block — the reducer's row-level truncation is ignored by a bound
   * editor.
   */
  truncateAt?: (offset: number) => void;
  /**
   * Content surgery: append `runs` to the LIVE content's end, focus, and land
   * the caret at the join offset. Backspace-merge drives the target block's
   * editor with it (through Lexical, so the collab binding syncs the
   * concatenation into the target's content doc with marks/tokens intact).
   */
  appendRunsAtEnd?: (runs: RichText) => void;
}

interface BlockEditorContextValue {
  pageId: string;
  /** Server truth with all pending structural ops replayed optimistically. */
  blocks: Block[];
  /**
   * Block ids present in AUTHORITATIVE server truth — the raw resource base,
   * with NO optimistic overlay. A freshly created / split block appears in
   * `blocks` immediately but only lands here once the server has really
   * committed its row. Consumers that must wait for the row to be
   * FK-satisfyingly real (the content-doc seed, Stage 4a) gate on this set.
   */
  serverIds: ReadonlySet<string>;
  /** True until the first authoritative blocks snapshot arrives. */
  pending: boolean;
  focusedBlockId: string | null;
  setFocusedBlockId: (id: string | null) => void;
  registerFocusHandle: (id: string, handle: BlockFocusHandle) => () => void;
  makeBlockAPI: (blockId: string) => BlockEditorAPI;
  setFlatOrder: (blocks: Block[]) => void;
  /** All blocks of the page (incl. collapsed), kept current for bulk ops. */
  setRows: (blocks: Block[]) => void;
  rowsRef: MutableRefObject<Block[]>;
  /**
   * Focus a block's text editor by id (defers until it mounts if needed). When
   * `caretOffset` is given and the block's editor is already mounted, land the
   * caret at that linear offset (used to restore the caret on a text undo/redo).
   */
  focusBlock: (id: string, caretOffset?: number) => void;
  focusBlockBoundary: (id: string, edge: "start" | "end") => boolean;
  move: (id: string, dest: { parentId: string | null; rank: Rank }) => void;
  /** Bulk operations on a set of selected block ids (see server endpoints). */
  bulkDelete: (ids: string[]) => void;
  bulkMove: (args: {
    ids: string[];
    parentId: string | null;
    afterId: string | null;
  }) => void;
  bulkDuplicate: (ids: string[]) => Promise<string[]>;
  paste: (args: {
    blocks: SerializedBlock[];
    afterId: string | null;
    parentId?: string | null;
  }) => Promise<string[]>;
  /**
   * Create a block of the given type at the end of the page and focus it
   * once the live resource re-renders the list.
   */
  insert: (type: string, data: unknown) => void;
  /**
   * Projection writer: persist the content doc's current runs to `data.text`
   * WITHOUT recording on the undo stack (Yjs owns text history). Keeps row
   * readers — search, backlinks, history snapshots, read-only views — fresh.
   * No-ops when the block row no longer exists.
   */
  projectText: (blockId: string, runs: RichText) => void;
  /**
   * Text-history recorder: mirror ONE captured `Y.UndoManager` item (a
   * coalesced typing run in `blockId`'s content doc) onto the unified undo
   * stack. Called by `CollabTextPlugin` from the content-doc seam's
   * `onUndoableEdit`.
   */
  recordTextEdit: (blockId: string, edit: CapturedBlockDocEdit) => void;
  /** Structural (document-tier) undo — reverses the last recorded block edit. */
  undo: () => void;
  /** Structural (document-tier) redo — re-applies the last undone block edit. */
  redo: () => void;
  /** Whether there is a recorded structural edit to undo. */
  canUndo: boolean;
  /** Whether there is an undone structural edit to redo. */
  canRedo: boolean;
  /**
   * Optional navigation callback so link/mention block renderers can open a
   * page without hardcoding any host app's pane. Undefined when the host did
   * not provide one.
   */
  onOpenPage?: (pageId: string) => void;
}

const BlockEditorContext = createContext<BlockEditorContextValue | null>(null);

export function useBlockEditor(): BlockEditorContextValue {
  const ctx = useContext(BlockEditorContext);
  if (!ctx) throw new Error("useBlockEditor must be used within a BlockEditorProvider");
  return ctx;
}

export function BlockEditorProvider({
  pageId,
  onOpenPage,
  children,
}: {
  pageId: string;
  onOpenPage?: (pageId: string) => void;
  children: ReactNode;
}) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const focusHandlesRef = useRef(new Map<string, BlockFocusHandle>());
  const flatOrderRef = useRef<Block[]>([]);
  const rowsRef = useRef<Block[]>([]);
  const pendingFocusRef = useRef<string | null>(null);

  // Structural keystroke ops apply optimistically: the client runs the SAME
  // `applyBlockOp` reducer the server runs, overlaid on live-state truth and
  // reconciled by the WS push. The captured `effect` drives both the idempotency
  // apply-guard (in `applyOverlayOp`) and content-based confirmation here.
  const params = useMemo(() => ({ pageId }), [pageId]);
  const optimistic = useOptimisticResource<Block[], BlockOverlayOp, { pageId: string }>({
    resource: blocksResource,
    params,
    apply: applyOverlayOp,
    // Structural ops keep their own `op` endpoint; undo/redo patches POST to the
    // generic `patch` endpoint. Both flow through this one instance so the
    // overlay + freeze pipeline (and confirmation) is shared.
    mutate: (v) =>
      v.tag === "patch"
        ? fetchEndpoint(patchBlocks, { pageId }, { body: v.patch }).then(() => undefined)
        : fetchEndpoint(applyBlockOpEndpoint, { pageId }, { body: v.op }).then(() => undefined),
    isConfirmedBy: (serverData, v) =>
      v.tag === "patch"
        ? isPatchReflected(serverData, v.patch)
        : isReflected(serverData, v.effect),
    // Op identity for cascade confirmation: only a newer confirmed op writing
    // the SAME block row(s) may supersede an older resolved one. This keeps
    // the stuck-inverse-pair fix (an undo patch + its redo inverse share their
    // id set) without letting an unrelated block's confirmation drop another
    // block's still-pending write (e.g. a `projectText` projection patch).
    sameTarget: sameOverlayTarget,
  });

  // Render-fresh view of the optimistic rows. `rowsRef` (set by a consumer
  // EFFECT) lags within a commit: when a structural patch removes a block, the
  // removed block's unmount cleanups run BEFORE the effect that refreshes
  // `rowsRef` — so existence checks against `rowsRef` in unmount paths see the
  // deleted row as still alive. `useLatestRef` writes during the provider's
  // render, which precedes those unmount cleanups in the same commit.
  const liveRowsRef = useLatestRef(optimistic.data);

  // Ids the SERVER has committed (see the interface doc) — recomputed on each
  // authoritative push, so the "row is now real" edge propagates push-based.
  const serverIds = useMemo(
    () => new Set(optimistic.serverData.map((b) => b.id)),
    [optimistic.serverData],
  );

  const registerFocusHandle = useCallback(
    (id: string, handle: BlockFocusHandle) => {
      focusHandlesRef.current.set(id, handle);
      if (pendingFocusRef.current === id) {
        pendingFocusRef.current = null;
        handle.focus();
      }
      return () => {
        focusHandlesRef.current.delete(id);
      };
    },
    [],
  );

  const setFlatOrder = useCallback((blocks: Block[]) => {
    flatOrderRef.current = blocks;
  }, []);

  const setRows = useCallback((blocks: Block[]) => {
    rowsRef.current = blocks;
  }, []);

  const { mutate: bulkDeleteMutation } = useEndpointMutation(bulkDeleteBlocks);

  const focusBlock = useCallback((id: string, caretOffset?: number) => {
    const handle = focusHandlesRef.current.get(id);
    if (handle) {
      // When a caret offset is requested and this block is a text editor, land
      // the caret precisely (the same leaf-aware placement `merge` uses); else a
      // plain focus restoring its last selection.
      if (caretOffset !== undefined && handle.focusOffset) handle.focusOffset(caretOffset);
      else handle.focus();
    } else pendingFocusRef.current = id;
  }, []);

  const focusBlockBoundary = useCallback(
    (id: string, edge: "start" | "end"): boolean => {
      const handle = focusHandlesRef.current.get(id);
      if (!handle) return false;
      if (handle.focusBoundary) handle.focusBoundary(edge);
      else handle.focus();
      return true;
    },
    [],
  );

  // --- Unified undo/redo (single document-level stack) ----------------------
  // ONE stack covers both text and structure (there is no per-block Lexical
  // `HistoryPlugin`): structural ops (create/split/merge/indent/outdent/delete/
  // move/convert/bulk) AND text edits (mirrored per-block `Y.UndoManager`
  // items via `recordTextEdit`). Structural recording happens at the mutation
  // chokepoints below: snapshot the current rows, compute the resulting rows,
  // diff into a minimal patch pair, and `record` undo/redo thunks that
  // dispatch those patches.
  const { record, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Dispatch a minimal patch through the SAME optimistic instance (instant
  // overlay + server reconcile). Goes DIRECTLY to `optimistic.dispatch`, never
  // through `recordStructural`, so a replayed patch is never re-recorded — and
  // the primitive's re-entrancy guard ignores `record` during replay anyway.
  const dispatchPatch = useCallback(
    (patch: BlockPatch) => {
      if (isEmptyPatch(patch)) return;
      optimistic.dispatch(buildPatchOverlayOp(patch));
    },
    [optimistic],
  );

  // Record a before→after change as a reversible command. Diffs the two full-row
  // snapshots into minimal forward/reverse patches; the thunks dispatch them and
  // best-effort restore focus to `focusId` (the block the user was on). A no-op
  // diff records nothing. `coalesceKey` is threaded into the entry so run-together
  // edits (typing) merge into one undo step; structural ops pass none.
  const recordPatchEntry = useCallback(
    (
      before: Block[],
      after: Block[],
      label: string,
      focusId: string | null,
      coalesceKey?: string,
    ) => {
      const derived = derivePatchEntry(before, after, focusId);
      if (!derived) return;
      const { undoPatch, redoPatch, undoFocus, redoFocus } = derived;
      record({
        label,
        coalesceKey,
        undo: () => {
          dispatchPatch(undoPatch);
          if (undoFocus) queueMicrotask(() => focusBlock(undoFocus));
        },
        redo: () => {
          dispatchPatch(redoPatch);
          if (redoFocus) queueMicrotask(() => focusBlock(redoFocus));
        },
      });
    },
    [record, dispatchPatch, focusBlock],
  );

  // Structural ops never coalesce (each is a distinct undo step), so this passes
  // no `coalesceKey` — preserving the previous `recordStructural` behavior exactly.
  const recordStructural = useCallback(
    (before: Block[], after: Block[], label: string, focusId: string | null) => {
      recordPatchEntry(before, after, label, focusId);
    },
    [recordPatchEntry],
  );

  // Combined recorder: a structural op whose forward apply
  // ALSO edited a content doc (split's origin-truncation, merge's target-append)
  // is ONE stack entry — a single Cmd+Z reverses the rows AND the doc together,
  // so they can never disagree. `docEdit` comes from `captureBlockDocEdit` (or a
  // hand-built doc-level pair for an unmounted target); undo runs it FIRST
  // (while the doc's editor is still bound), redo re-applies the patch first
  // (recreating rows the doc edit's subscribers may need). `undoTextOverride`
  // pins a restored row's `data.text` to the LIVE runs captured at op time —
  // for merge, the deleted source block's doc is re-SEEDED from that row on
  // undo, and the row snapshot may lag the doc by the projection debounce.
  const recordStructuralWithDocEdit = useCallback(
    (
      before: Block[],
      after: Block[],
      label: string,
      focusId: string | null,
      docEdit: CapturedBlockDocEdit | null,
      undoTextOverride?: { blockId: string; runs: RichText },
    ) => {
      const derived = derivePatchEntry(before, after, focusId, undoTextOverride);
      // Bail only when there is NOTHING to record: empty patches AND no doc edit.
      // A docEdit-only entry (empty structural diff) must still record so its
      // content-doc reverse/re-apply lands on the stack; its (empty) patches
      // no-op through `dispatchPatch` and focus falls back to `focusId`.
      if (!derived && !docEdit) return;
      const { undoPatch, redoPatch, undoFocus, redoFocus } = derived ?? {
        undoPatch: { upserts: [], deleteIds: [] },
        redoPatch: { upserts: [], deleteIds: [] },
        undoFocus: focusId,
        redoFocus: focusId,
      };
      record({
        label,
        undo: async () => {
          await docEdit?.undo();
          dispatchPatch(undoPatch);
          if (undoFocus) queueMicrotask(() => focusBlock(undoFocus));
        },
        redo: async () => {
          dispatchPatch(redoPatch);
          await docEdit?.redo();
          if (redoFocus) queueMicrotask(() => focusBlock(redoFocus));
        },
      });
    },
    [record, dispatchPatch, focusBlock],
  );

  // Text recorder: one shared-stack entry per captured
  // `Y.UndoManager` item. Deliberately NO `coalesceKey`: the manager's
  // captureTimeout already folded the typing run into the ONE item these
  // thunks pop — app-level coalescing would merge two entries over two manager
  // items and break the 1:1 LIFO correspondence (`um.undo()` pops exactly one).
  const recordTextEdit = useCallback(
    (blockId: string, edit: CapturedBlockDocEdit) => {
      record({
        label: "Edit text",
        undo: async () => {
          await edit.undo();
          queueMicrotask(() => focusBlock(blockId));
        },
        redo: async () => {
          await edit.redo();
          queueMicrotask(() => focusBlock(blockId));
        },
      });
    },
    [record, focusBlock],
  );

  // THE single chokepoint for any single-row mutation. Snapshot the current rows,
  // apply `transform` to just the target row, diff into a minimal forward/reverse
  // patch pair, optionally `record` it on the unified stack, then dispatch the
  // forward patch through the SAME optimistic-patch pipeline as structural ops.
  // Every single-row writer (`projectText`, the block API's `update`/`convertTo`/
  // `setExpanded`) funnels through here, so forward apply and undo/redo are always
  // symmetric and a no-op diff records and dispatches nothing. Undo/redo restore
  // focus to the mutated block (at `caretOffset` when given). `coalesceKey` merges
  // run-together edits into one undo step; `record: false` keeps a mutation off the
  // stack (view state) while still flowing it through the optimistic pipeline.
  const commitRow = useCallback(
    (
      blockId: string,
      transform: (b: Block) => Block,
      opts: {
        label: string;
        coalesceKey?: string;
        caretOffset?: number;
        record?: boolean;
        /**
         * Dispatch the forward patch as update-only (never creates rows; a
         * concurrently-deleted row is skipped). Only meaningful with
         * `record: false` — recorded entries need creation semantics so
         * undoing a delete can re-create rows. Used by the CRDT projection.
         */
        updateOnly?: boolean;
      },
    ) => {
      const before = rowsRef.current;
      const after = before.map((b) => (b.id === blockId ? transform(b) : b));
      const patches = patchesFromDiff(diffBlocks(before, after));
      const undoPatch = patches.undo;
      const redoPatch = opts.updateOnly ? { ...patches.redo, updateOnly: true } : patches.redo;
      if (isEmptyPatch(undoPatch) && isEmptyPatch(redoPatch)) return;
      if (opts.record !== false) {
        record({
          label: opts.label,
          coalesceKey: opts.coalesceKey,
          undo: () => {
            dispatchPatch(undoPatch);
            queueMicrotask(() => focusBlock(blockId, opts.caretOffset));
          },
          redo: () => {
            dispatchPatch(redoPatch);
            queueMicrotask(() => focusBlock(blockId, opts.caretOffset));
          },
        });
      }
      dispatchPatch(redoPatch);
    },
    [record, dispatchPatch, focusBlock],
  );

  // `content doc → data.text` projection write (see the interface doc). NEVER
  // recorded: text history lives in the block's `Y.Doc` (wired into the
  // unified stack via `recordTextEdit`), so a projection landing on the undo
  // stack would double-count it. Still flows through the shared optimistic
  // patch pipeline (server write + `blocksChanged` fan-out) and no-ops when
  // the row is unchanged or gone.
  const projectText = useCallback(
    (blockId: string, runs: RichText) => {
      // Existence gate against the RENDER-FRESH rows, not `rowsRef` (Stage 3b
      // fix): the projection's unmount flush fires while a structural patch
      // that deleted this block is committing — `rowsRef` still lists the row
      // at that instant, and projecting through it would UPSERT (resurrect)
      // the just-deleted block. `liveRowsRef` already reflects the deletion.
      if (!liveRowsRef.current.some((b) => b.id === blockId)) return;
      // `updateOnly` (Stage 4a): the client-side gate above can't cover the
      // window where the row was deleted SERVER-side (history restore, another
      // tab's delete) but the push hasn't reached this client yet — an
      // ordinary upsert landing in that window would resurrect the deleted
      // row with pre-delete text. Update-only skips a missing row on the
      // server too, closing the race end-to-end.
      commitRow(
        blockId,
        (b) => ({ ...b, data: { ...(b.data ?? {}), text: runs } }),
        { label: "Project text", record: false, updateOnly: true },
      );
    },
    [commitRow, liveRowsRef],
  );

  const bulkDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      // Record before firing: after = current rows minus each id's full subtree
      // (the server cascade-deletes the subtree, so mirror that exactly).
      const before = rowsRef.current;
      const removed = new Set(ids.flatMap((id) => subtreeIds(before, id)));
      const after = before.filter((b) => !removed.has(b.id));
      recordStructural(before, after, "Delete blocks", null);
      bulkDeleteMutation({ params: { pageId }, body: { ids } });
    },
    [pageId, bulkDeleteMutation, recordStructural],
  );

  const bulkMove = useCallback(
    (args: { ids: string[]; parentId: string | null; afterId: string | null }) => {
      if (args.ids.length === 0) return;
      // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: DnD bulk-move rank write; blocksResource push re-renders, drag again to fix.
      void fetchEndpoint(bulkMoveBlocks, { pageId }, { body: args });
    },
    [pageId],
  );

  const bulkDuplicate = useCallback(
    async (ids: string[]): Promise<string[]> => {
      if (ids.length === 0) return [];
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
    async (args: {
      blocks: SerializedBlock[];
      afterId: string | null;
      parentId?: string | null;
    }): Promise<string[]> => {
      if (args.blocks.length === 0) return [];
      const { rootIds } = await fetchEndpoint(
        pasteBlocks,
        { pageId },
        { body: { ...args, parentId: args.parentId ?? null } },
      );
      return rootIds;
    },
    [pageId],
  );

  const move = useCallback(
    (id: string, dest: { parentId: string | null; rank: Rank }) => {
      // Record before firing: the destination parent/rank is client-known, so the
      // resulting rows are exactly `applyBlockOp(before, move)` (the same reducer
      // the server's move path is consistent with for a single in-page reparent).
      const before = rowsRef.current;
      const after = fromOpResult(before, {
        kind: "move",
        blockId: id,
        parentId: dest.parentId,
        rank: dest.rank.toJSON(),
      });
      recordStructural(before, after, OP_LABELS.move, id);
      // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: DnD rank/parent write; blocksResource push re-renders, drag again to fix.
      void fetchEndpoint(
        moveBlock,
        { id },
        { body: { parentId: dest.parentId, rank: dest.rank } },
      );
    },
    [recordStructural],
  );

  // Apply a single tree op optimistically AND record it for structural undo. The
  // effect is captured from the CURRENT optimistic rows
  // (`rowsRef.current`), so chained keystrokes compose; `optimistic.dispatch`
  // overlays the prediction and fires the network call. New blocks carry
  // client-minted ids, so callers mint + focus up front. The op's after-state is
  // computed with the SAME pure `applyBlockOp` the server runs, so the recorded
  // diff is exact.
  const dispatchOp = useCallback(
    (op: BlockOp) => {
      const before = rowsRef.current;
      const after = fromOpResult(before, op);
      recordStructural(before, after, OP_LABELS[op.kind], opFocusId(op));
      optimistic.dispatch(buildOverlayOp(op, before));
    },
    [optimistic, recordStructural],
  );

  // Overlay-dispatch triplet shared by the split / offscreen-merge executors:
  // snapshot the current optimistic rows, compute the after-state with the SAME
  // pure `applyBlockOp` the server runs, dispatch the structural overlay (instant
  // prediction + network call), and return both snapshots for the combined record.
  // NOT used by the mounted-merge site, whose dispatch is deliberately deferred
  // into a microtask after the append lands (see the merge executor, issue #7).
  const applyOverlay = useCallback(
    (op: BlockOp): { before: Block[]; after: Block[] } => {
      const before = rowsRef.current;
      const after = fromOpResult(before, op);
      optimistic.dispatch(buildOverlayOp(op, before));
      return { before, after };
    },
    [optimistic],
  );

  // Focus a freshly-minted block by its known id. If its text editor has already
  // mounted, focus immediately; otherwise queue it so `registerFocusHandle`
  // focuses it on mount (the live push will mount it shortly).
  const focusNew = useCallback((id: string) => {
    pendingFocusRef.current = id;
    const handle = focusHandlesRef.current.get(id);
    if (handle) {
      pendingFocusRef.current = null;
      handle.focus();
    }
  }, []);

  // Insert a new block at the end of the page. Top-level page content is
  // parented to the page block (`parentId: pageId`), since `computePageId(null)`
  // is null. Omitting `afterId` lets the reducer append it after the last
  // existing sibling under the page. The id is minted up front so focus does not
  // wait on the server round-trip.
  const insert = useCallback(
    (type: string, data: unknown) => {
      const newId = crypto.randomUUID();
      focusNew(newId);
      dispatchOp({ kind: "insert", newId, type, data, parentId: pageId });
    },
    [pageId, dispatchOp, focusNew],
  );

  const makeBlockAPI = useCallback(
    (blockId: string): BlockEditorAPI => ({
      update(data: unknown) {
        // The single data-write affordance every block renderer uses — routed
        // through `commitRow` so non-text edits (to-do checked, callout color,
        // image src, …) are optimistic AND recorded. `coalesceKey: blockId`
        // collapses streaming/rapid same-block edits into one undo step.
        commitRow(blockId, (b) => ({ ...b, data }), { label: "Edit block", coalesceKey: blockId });
      },
      setExpanded(expanded: boolean) {
        // Pure view state — deliberately NOT recorded into history (`record: false`):
        // Notion doesn't undo collapse/expand; it's not a document edit. Still flows
        // through the optimistic patch pipeline for snappiness, self-correcting on
        // re-click via the blocksResource push.
        commitRow(blockId, (b) => ({ ...b, expanded }), { label: "Toggle collapse", record: false });
      },
      convertTo(type: string, data: unknown, opts?: { expanded?: boolean }) {
        // Type conversion IS a recorded document edit. Its forward apply now flows
        // through the same optimistic patch pipeline as its undo/redo via `commitRow`
        // (which no-ops a missing/unchanged block on its own).
        commitRow(
          blockId,
          (b) => ({ ...b, type, data, expanded: opts?.expanded ?? b.expanded }),
          { label: "Change block type" },
        );
      },
      insertAfter(type: string, data: unknown) {
        const newId = crypto.randomUUID();
        focusNew(newId);
        dispatchOp({ kind: "insert", newId, type, data, afterId: blockId });
      },
      split(
        position: number,
        opts?: { asChild?: boolean; childType?: string; siblingType?: string; runs?: RichText },
      ) {
        // Thin executor: the asChild decision is owned by `resolveKeystroke`
        // (the single intent step) and passed in explicitly. The new block's id
        // is minted up front so we can focus it without awaiting the response.
        const newId = crypto.randomUUID();
        focusNew(newId);
        const op: BlockOp = {
          kind: "split",
          blockId,
          position,
          newId,
          asChild: opts?.asChild ?? false,
          childType: opts?.childType,
          siblingType: opts?.siblingType,
          runs: opts?.runs,
        };
        // The reducer left the HEAD in this block's row, but the bound editor
        // ignores rows — the LIVE content must be
        // truncated from the caret too. The op's `runs` were captured from the
        // live editor BEFORE this truncation, so the new block's `data.text`
        // seed (the tail its content doc initializes from on mount) is
        // caret-exact. Driving the deletion through Lexical (`truncateAt`)
        // lets the collab binding sync it into the content doc like any local
        // edit — and `captureBlockDocEdit` folds that doc edit into ONE
        // combined stack entry with the structural patch, so a single Cmd+Z
        // removes the new block AND restores this block's full pre-split
        // content (rows and docs reverse together, never half).
        //
        // The capture is DEFERRED a microtask: `split` is called from a
        // Lexical command handler, i.e. INSIDE this editor's own update — a
        // nested `editor.update` (even `discrete`) is queued by Lexical, so a
        // synchronous truncation call here would commit (and transact into
        // Yjs) only after `captureBlockDocEdit`'s window closed, escaping the
        // fold and double-recording as a plain text entry. One microtask puts
        // it outside the outer update; record order is unaffected (no other
        // record can interleave within the same task).
        const { before, after } = applyOverlay(op);
        queueMicrotask(() => {
          const docEdit = captureBlockDocEdit(blockId, () => {
            focusHandlesRef.current.get(blockId)?.truncateAt?.(position);
          });
          recordStructuralWithDocEdit(before, after, OP_LABELS.split, newId, docEdit);
        });
      },
      merge(opts?: { runs?: RichText }) {
        // Thin executor: `resolveKeystroke` already decided this is a merge (not
        // an outdent). The reducer merges into the previous VISIBLE leaf, so we
        // resolve the same target here to land the caret at the JOIN offset (the
        // leaf's text length BEFORE the merge appends `block`'s text).
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        if (!block) return;
        const target = prevVisibleLeaf(nodes, block);
        if (!target) return; // defensive: nothing to merge into
        // The reducer's row-level text concatenation is ignored by bound
        // editors — the merging block's LIVE runs (may contain unflushed
        // edits) must land in the TARGET's content doc too. Both variants
        // record ONE combined stack entry (structural patch + doc edit) so a
        // single Cmd+Z restores this block's row AND un-appends the target's
        // doc together. The restored source row's `data.text` is pinned to
        // the live `mergingRuns` (undoTextOverride): the source doc was
        // FK-cascade-dropped with the row, so on undo it re-seeds from
        // `data.text` — which must be exactly what was removed from the
        // target, not a projection-lagged snapshot.
        const mergingRuns = opts?.runs ?? runsOfNode(block);
        const targetHandle = focusHandlesRef.current.get(target.id);
        const op: BlockOp = { kind: "merge", blockId, runs: opts?.runs };
        if (targetHandle?.appendRunsAtEnd) {
          // Mounted target: drive its bound editor (append + caret at the live
          // join). Append-FIRST ordering (issue #7): the append rides a microtask
          // (deferred so the current keydown can't act on the newly-focused
          // block), and the structural delete overlay is dispatched only AFTER the
          // append lands — so a throwing append leaves BOTH blocks intact (a loud
          // unhandled rejection, overlay never dispatched), matching the offscreen
          // branch's guarantee, instead of removing the source row with its text
          // un-transferred. `before`/`after` are captured up front so they snapshot
          // the pre-merge rows; the dispatch is kept explicit here (not
          // `applyOverlay`) precisely because its ordering is deferred.
          const append = targetHandle.appendRunsAtEnd;
          const before = rowsRef.current;
          const after = fromOpResult(before, op);
          queueMicrotask(() => {
            // `captureBlockDocEdit` runs `append` synchronously (surgery uses
            // `discrete: true`), so a throw propagates out of the microtask
            // BEFORE the dispatch — the source row is never removed.
            const docEdit = captureBlockDocEdit(target.id, () => append(mergingRuns));
            optimistic.dispatch(buildOverlayOp(op, before));
            recordStructuralWithDocEdit(before, after, OP_LABELS.merge, blockId, docEdit, {
              blockId,
              runs: mergingRuns,
            });
          });
        } else {
          // Unmounted target (virtualized offscreen): lossless doc-level
          // append FIRST, structural delete only after it lands — a failed
          // append leaves both blocks intact (loud unhandled rejection)
          // instead of orphaning the text in a row the target's doc would
          // later overwrite via projection. No caret to place: the target
          // has no editor. No live undo manager either, so the combined
          // entry's doc thunks are doc-level: undo truncates the target's
          // doc back to the returned join offset, redo re-appends. The
          // target's `data.text` is read at thunk run time (doc-init seeds
          // from it only if the doc row vanished meanwhile).
          const targetId = target.id;
          void appendRunsToBlockDoc(targetId, runsOfNode(target), mergingRuns).then(
            ({ joinOffset }) => {
              const { before, after } = applyOverlay(op);
              const targetDataText = () =>
                (rowsRef.current.find((b) => b.id === targetId)?.data as
                  | Record<string, unknown>
                  | null)?.text;
              const docEdit: CapturedBlockDocEdit = {
                undo: () => truncateBlockDocFrom(targetId, targetDataText(), joinOffset),
                redo: async () => {
                  await appendRunsToBlockDoc(targetId, targetDataText(), mergingRuns);
                },
              };
              recordStructuralWithDocEdit(before, after, OP_LABELS.merge, blockId, docEdit, {
                blockId,
                runs: mergingRuns,
              });
            },
          );
        }
      },
      remove() {
        dispatchOp({ kind: "delete", blockId });
      },
      indent() {
        // Thin executor: the "has a previous sibling to nest under" guard is owned
        // by `resolveKeystroke`; the reducer is a no-op if it somehow isn't.
        dispatchOp({ kind: "indent", blockId });
        focusBlock(blockId);
      },
      outdent() {
        // Thin executor: the "is indented" guard is owned by `resolveKeystroke`;
        // the reducer is a no-op for a top-level block.
        dispatchOp({ kind: "outdent", blockId });
        focusBlock(blockId);
      },
      navigate(dir, caret) {
        const flat = flatOrderRef.current;
        const idx = flat.findIndex((b) => b.id === blockId);
        if (idx < 0) return;
        // Skip void blocks with no registered focus handle (e.g. images), landing
        // on the nearest focusable block in this direction.
        const step = dir === "up" || dir === "left" ? -1 : 1;
        let j = idx + step;
        while (
          j >= 0 &&
          j < flat.length &&
          !focusHandlesRef.current.has(flat[j]!.id)
        ) {
          j += step;
        }
        const target = flat[j];
        if (!target) return;
        const handle = focusHandlesRef.current.get(target.id);
        if (!handle) return;
        if (dir === "up") {
          if (caret && handle.focusAtColumn) handle.focusAtColumn(caret.caretX, "bottom");
          else if (handle.focusBoundary) handle.focusBoundary("end");
          else handle.focus();
        } else if (dir === "down") {
          if (caret && handle.focusAtColumn) handle.focusAtColumn(caret.caretX, "top");
          else if (handle.focusBoundary) handle.focusBoundary("start");
          else handle.focus();
        } else if (dir === "left") {
          if (handle.focusBoundary) handle.focusBoundary("end");
          else handle.focus();
        } else {
          if (handle.focusBoundary) handle.focusBoundary("start");
          else handle.focus();
        }
      },
      onFocus() {
        setFocusedBlockId(blockId);
      },
    }),
    [
      dispatchOp,
      focusNew,
      focusBlock,
      commitRow,
      optimistic,
      applyOverlay,
      recordStructuralWithDocEdit,
    ],
  );

  const value = useMemo<BlockEditorContextValue>(
    () => ({
      pageId,
      blocks: optimistic.data,
      serverIds,
      pending: optimistic.pending,
      focusedBlockId,
      setFocusedBlockId,
      registerFocusHandle,
      makeBlockAPI,
      setFlatOrder,
      setRows,
      rowsRef,
      focusBlock,
      focusBlockBoundary,
      move,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
      insert,
      projectText,
      recordTextEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      onOpenPage,
    }),
    [
      pageId,
      optimistic.data,
      serverIds,
      optimistic.pending,
      focusedBlockId,
      setFocusedBlockId,
      registerFocusHandle,
      makeBlockAPI,
      setFlatOrder,
      setRows,
      focusBlock,
      focusBlockBoundary,
      move,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
      insert,
      projectText,
      recordTextEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      onOpenPage,
    ],
  );

  return (
    <BlockEditorContext.Provider value={value}>
      {children}
    </BlockEditorContext.Provider>
  );
}
