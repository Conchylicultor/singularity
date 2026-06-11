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
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  updateBlock,
  moveBlock,
  applyBlockOpEndpoint,
  blocksResource,
  childrenOf,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
  type Block,
  type BlockOp,
  type SerializedBlock,
} from "../core";
import {
  applyOverlayOp,
  buildOverlayOp,
  isReflected,
  toNodes,
  type BlockOverlayOp,
} from "./internal/optimistic-block-ops";
import type { BlockEditorAPI } from "./types";

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
  /** Focus a block's text editor by id (defers until it mounts if needed). */
  focusBlock: (id: string) => void;
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
    mutate: (v) =>
      fetchEndpoint(applyBlockOpEndpoint, { pageId }, { body: v.op }).then(() => undefined),
    isConfirmedBy: (serverData, v) => isReflected(serverData, v.effect),
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
  const { mutate: updateBlockMutation } = useEndpointMutation(updateBlock);

  const focusBlock = useCallback((id: string) => {
    const handle = focusHandlesRef.current.get(id);
    if (handle) handle.focus();
    else pendingFocusRef.current = id;
  }, []);

  const bulkDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      bulkDeleteMutation({ params: { pageId }, body: { ids } });
    },
    [pageId, bulkDeleteMutation],
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
      // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: DnD rank/parent write; blocksResource push re-renders, drag again to fix.
      void fetchEndpoint(
        moveBlock,
        { id },
        { body: { parentId: dest.parentId, rank: dest.rank } },
      );
    },
    [],
  );

  // Apply a single tree op optimistically. The effect + textOwners are captured
  // from the CURRENT optimistic rows (`rowsRef.current`), so chained keystrokes
  // compose; `optimistic.dispatch` overlays the prediction and fires the network
  // call. New blocks carry client-minted ids, so callers mint + focus up front.
  const dispatchOp = useCallback(
    (op: BlockOp) => {
      optimistic.dispatch(buildOverlayOp(op, rowsRef.current));
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
        updateBlockMutation({ params: { id: blockId }, body: { data } });
      },
      setExpanded(expanded: boolean) {
        // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: expand/collapse toggle; self-correcting on re-click via blocksResource push.
        void fetchEndpoint(updateBlock, { id: blockId }, { body: { expanded } });
      },
      convertTo(type: string, data: unknown, opts?: { expanded?: boolean }) {
        updateBlockMutation({ params: { id: blockId }, body: { type, data, ...(opts ?? {}) } });
      },
      insertAfter(type: string, data: unknown) {
        const newId = crypto.randomUUID();
        focusNew(newId);
        dispatchOp({ kind: "insert", newId, type, data, afterId: blockId });
      },
      split(
        position: number,
        opts?: { asChild?: boolean; childType?: string; text?: string },
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
          text: opts?.text,
        });
      },
      merge(opts?: { text?: string }) {
        // Thin executor: `resolveKeystroke` already decided this is a merge (not
        // an outdent) and that a previous sibling exists. We re-find it only to
        // move the caret there once the keydown settles.
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        if (!block) return;
        const siblings = childrenOf(nodes, block.parentId);
        const idx = siblings.findIndex((s) => s.id === blockId);
        const prev = idx > 0 ? siblings[idx - 1] : null;
        if (!prev) return; // defensive: nothing to merge into
        dispatchOp({ kind: "merge", blockId, text: opts?.text });
        // Defer focusing the prev sibling to after the current keydown: moving
        // DOM focus synchronously mid-event lets the native backspace land on the
        // newly-focused block. The prev sibling already exists client-side.
        const prevId = prev.id;
        queueMicrotask(() => focusHandlesRef.current.get(prevId)?.focus());
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
    [dispatchOp, focusNew, focusBlock, updateBlockMutation],
  );

  return (
    <BlockEditorContext.Provider
      value={{
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
        onOpenPage,
      }}
    >
      {children}
    </BlockEditorContext.Provider>
  );
}
