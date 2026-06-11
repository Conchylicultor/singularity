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
  registerFocusHandle: (id: string, handle: { focus: () => void }) => () => void;
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
  const focusHandlesRef = useRef(new Map<string, { focus: () => void }>());
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
    (id: string, handle: { focus: () => void }) => {
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
        // Resolve `asChild` here against the live page tree. The new block's id
        // is minted up front so we can focus it without awaiting the response.
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        const data = block?.data as Record<string, unknown> | null | undefined;
        const textLength =
          data && typeof data.text === "string" ? data.text.length : 0;
        const hasExpandedChildren =
          !!block?.expanded && childrenOf(nodes, blockId).length > 0;
        // Honor an explicit contributor `asChild`; otherwise nest the split-off
        // content as the first child only when splitting at the very end of a
        // block that has visible children (Notion's Enter-at-end behavior).
        const asChild =
          opts?.asChild ?? (hasExpandedChildren && position === textLength);

        const newId = crypto.randomUUID();
        focusNew(newId);
        dispatchOp({
          kind: "split",
          blockId,
          position,
          newId,
          asChild,
          childType: opts?.childType,
          text: opts?.text,
        });
      },
      merge(opts?: { text?: string }) {
        // Resolve de-indent vs. merge against the live page tree. Keyboard only
        // calls this at caret-start-of-line, so this owns the structural intent.
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        if (!block) return;

        // "Indented" = parented to a normal content block (not the page itself).
        // The page's direct children carry `parentId === pageId`; anything with a
        // deeper parent is an indented block that should de-indent instead.
        const isIndented =
          block.parentId !== null && block.parentId !== pageId;
        if (isIndented) {
          // De-indent (outdent) and keep the caret on the same block.
          dispatchOp({ kind: "outdent", blockId });
          focusBlock(blockId);
          return;
        }

        // Top level (or directly under page): merge into the previous sibling.
        const siblings = childrenOf(nodes, block.parentId);
        const idx = siblings.findIndex((s) => s.id === blockId);
        const prev = idx > 0 ? siblings[idx - 1] : null;
        if (!prev) return; // first block, nothing to merge into — no-op
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
        // Pre-guard: indenting requires a previous sibling to nest under.
        // Skipping the dispatch when there is none mirrors today's benign no-op.
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        if (!block) return;
        const siblings = childrenOf(nodes, block.parentId);
        const idx = siblings.findIndex((s) => s.id === blockId);
        if (idx <= 0) return; // no previous sibling — no-op
        dispatchOp({ kind: "indent", blockId });
        focusBlock(blockId);
      },
      outdent() {
        // Pre-guard: a block already at top level (directly under the page) has
        // nowhere to outdent to. Mirrors today's benign no-op.
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        if (!block) return;
        if (block.parentId === null || block.parentId === pageId) return;
        dispatchOp({ kind: "outdent", blockId });
        focusBlock(blockId);
      },
      focusUp() {
        const flat = flatOrderRef.current;
        const idx = flat.findIndex((b) => b.id === blockId);
        if (idx > 0) {
          const targetId = flat[idx - 1]!.id;
          focusHandlesRef.current.get(targetId)?.focus();
        }
      },
      focusDown() {
        const flat = flatOrderRef.current;
        const idx = flat.findIndex((b) => b.id === blockId);
        if (idx >= 0 && idx < flat.length - 1) {
          const targetId = flat[idx + 1]!.id;
          focusHandlesRef.current.get(targetId)?.focus();
        }
      },
      onFocus() {
        setFocusedBlockId(blockId);
      },
    }),
    [pageId, dispatchOp, focusNew, focusBlock, updateBlockMutation],
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
