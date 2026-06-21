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
  textOf,
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
  applyOverlayOp,
  buildOverlayOp,
  buildPatchOverlayOp,
  isReflected,
  isPatchReflected,
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
}

interface BlockEditorContextValue {
  pageId: string;
  /** Server truth with all pending structural ops replayed optimistically. */
  blocks: Block[];
  /** True until the first authoritative blocks snapshot arrives. */
  pending: boolean;
  /** Block ids whose text an in-flight structural op owns (freeze autosave). */
  frozenIds: ReadonlySet<string>;
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
   * Persist a block's edited text runs through the optimistic-patch pipeline AND
   * record it on the unified undo stack (coalesced per block). Replaces the old
   * `PATCH /api/blocks/:id` text-autosave path, so forward typing and undo/redo
   * are fully symmetric.
   */
  commitText: (blockId: string, nextRuns: RichText, caretOffset: number) => void;
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
  });

  // Block ids whose text any in-flight op owns — `BlockTextEditor` freezes their
  // autosave so a stale `flush()` can't clobber the reducer's text edit.
  const frozenIds = useMemo(
    () => new Set(optimistic.inFlight.flatMap((o) => o.vars.textOwners)),
    [optimistic.inFlight],
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

  // --- Unified undo/redo (single document-level stack) ----------------------
  // ONE stack covers both text and structure (there is no per-block Lexical
  // `HistoryPlugin`): structural ops (create/split/merge/indent/outdent/delete/
  // move/convert/bulk) AND text edits (`commitText`). Recording happens at the
  // mutation chokepoints below: snapshot the current rows, compute the resulting
  // rows, diff into a minimal patch pair, and `record` undo/redo thunks that
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
      const { undo: undoPatch, redo: redoPatch } = patchesFromDiff(diffBlocks(before, after));
      if (isEmptyPatch(undoPatch) && isEmptyPatch(redoPatch)) return;
      // Focus targets per direction. Redo keeps the `focusId` the user was on
      // (e.g. the freshly-split block). Undo PREFERS the block the reverse patch
      // restores (`undoPatch.upserts[0]`) over `focusId`: undoing a split deletes
      // the new block — landing focus on it would drop focus to <body> — whereas
      // the reverse upsert is the original surviving block. Falls back to `focusId`
      // then the forward upsert so every op still lands somewhere sane.
      const redoFocus = focusId ?? redoPatch.upserts[0]?.id ?? null;
      const undoFocus = undoPatch.upserts[0]?.id ?? focusId ?? null;
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

  // THE single chokepoint for any single-row mutation. Snapshot the current rows,
  // apply `transform` to just the target row, diff into a minimal forward/reverse
  // patch pair, optionally `record` it on the unified stack, then dispatch the
  // forward patch through the SAME optimistic-patch pipeline as structural ops.
  // Every single-row writer (`commitText`, the block API's `update`/`convertTo`/
  // `setExpanded`) funnels through here, so forward apply and undo/redo are always
  // symmetric and a no-op diff records and dispatches nothing. Undo/redo restore
  // focus to the mutated block (at `caretOffset` when given). `coalesceKey` merges
  // run-together edits into one undo step; `record: false` keeps a mutation off the
  // stack (view state) while still flowing it through the optimistic pipeline.
  const commitRow = useCallback(
    (
      blockId: string,
      transform: (b: Block) => Block,
      opts: { label: string; coalesceKey?: string; caretOffset?: number; record?: boolean },
    ) => {
      const before = rowsRef.current;
      const after = before.map((b) => (b.id === blockId ? transform(b) : b));
      const { undo: undoPatch, redo: redoPatch } = patchesFromDiff(diffBlocks(before, after));
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

  // Persist a block's edited text as a `data.text` row patch through the shared
  // `commitRow` chokepoint, so forward typing and undo/redo flow through the SAME
  // optimistic-patch pipeline (not the old `PATCH /api/blocks/:id`). The entry
  // coalesces per `blockId` so a typing run is one undo step; undo/redo land the
  // caret back at `caretOffset`.
  const commitText = useCallback(
    (blockId: string, nextRuns: RichText, caretOffset: number) => {
      commitRow(
        blockId,
        (b) => ({ ...b, data: { ...(b.data ?? {}), text: nextRuns } }),
        { label: "Edit text", coalesceKey: blockId, caretOffset },
      );
    },
    [commitRow],
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
  // effect + textOwners are captured from the CURRENT optimistic rows
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
        dispatchOp({
          kind: "split",
          blockId,
          position,
          newId,
          asChild: opts?.asChild ?? false,
          childType: opts?.childType,
          siblingType: opts?.siblingType,
          runs: opts?.runs,
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
        const joinOffset = textOf(target).length;
        dispatchOp({ kind: "merge", blockId, runs: opts?.runs });
        // Defer focusing the target to after the current keydown: moving DOM
        // focus synchronously mid-event lets the native backspace land on the
        // newly-focused block. An absolute offset is timing-robust — whether or
        // not the merged text has synced in yet, `joinOffset` is correct. The
        // target already exists client-side.
        const targetId = target.id;
        queueMicrotask(() => {
          const fh = focusHandlesRef.current.get(targetId);
          fh?.focusOffset?.(joinOffset) ?? fh?.focus();
        });
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
    [dispatchOp, focusNew, focusBlock, commitRow],
  );

  const value = useMemo<BlockEditorContextValue>(
    () => ({
      pageId,
      blocks: optimistic.data,
      pending: optimistic.pending,
      frozenIds,
      focusedBlockId,
      setFocusedBlockId,
      registerFocusHandle,
      makeBlockAPI,
      setFlatOrder,
      setRows,
      rowsRef,
      focusBlock,
      move,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
      insert,
      commitText,
      undo,
      redo,
      canUndo,
      canRedo,
      onOpenPage,
    }),
    [
      pageId,
      optimistic.data,
      optimistic.pending,
      frozenIds,
      focusedBlockId,
      setFocusedBlockId,
      registerFocusHandle,
      makeBlockAPI,
      setFlatOrder,
      setRows,
      focusBlock,
      move,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
      insert,
      commitText,
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
