import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  createBlock,
  updateBlock,
  splitBlock,
  mergeBlocks,
  deleteBlock,
  indentBlock,
  outdentBlock,
  moveBlock,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
  type Block,
  type SerializedBlock,
} from "../core";
import type { BlockEditorAPI } from "./types";

interface BlockEditorContextValue {
  pageId: string;
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

  const focusBlock = useCallback((id: string) => {
    const handle = focusHandlesRef.current.get(id);
    if (handle) handle.focus();
    else pendingFocusRef.current = id;
  }, []);

  const bulkDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      void fetchEndpoint(bulkDeleteBlocks, { pageId }, { body: { ids } });
    },
    [pageId],
  );

  const bulkMove = useCallback(
    (args: { ids: string[]; parentId: string | null; afterId: string | null }) => {
      if (args.ids.length === 0) return;
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
      void fetchEndpoint(
        moveBlock,
        { id },
        { body: { parentId: dest.parentId, rank: dest.rank } },
      );
    },
    [],
  );

  // Insert a new block at the end of the page. Top-level page content is
  // parented to the page block (`parentId: pageId`), since `computePageId(null)`
  // is null. Omitting `rank` lets the server append it after the last existing
  // sibling. Once the live resource re-renders and the new block registers its
  // focus handle, focus it.
  const insert = useCallback(
    (type: string, data: unknown) => {
      void (async () => {
        const created = await fetchEndpoint(
          createBlock,
          {},
          { body: { parentId: pageId, type, data } },
        );
        pendingFocusRef.current = created.id;
        const handle = focusHandlesRef.current.get(created.id);
        if (handle) {
          pendingFocusRef.current = null;
          handle.focus();
        }
      })();
    },
    [pageId],
  );

  const makeBlockAPI = useCallback(
    (blockId: string): BlockEditorAPI => ({
      update(data: unknown) {
        void fetchEndpoint(updateBlock, { id: blockId }, { body: { data } });
      },
      setExpanded(expanded: boolean) {
        void fetchEndpoint(updateBlock, { id: blockId }, { body: { expanded } });
      },
      convertTo(type: string, data: unknown, opts?: { expanded?: boolean }) {
        void fetchEndpoint(updateBlock, { id: blockId }, { body: { type, data, ...(opts ?? {}) } });
      },
      insertAfter(type: string, data: unknown) {
        void (async () => {
          const created = await fetchEndpoint(
            createBlock,
            {},
            { body: { type, data, afterId: blockId } },
          );
          pendingFocusRef.current = created.id;
          const handle = focusHandlesRef.current.get(created.id);
          if (handle) {
            pendingFocusRef.current = null;
            handle.focus();
          }
        })();
      },
      split(position: number, opts?: { asChild?: boolean; childType?: string }) {
        void (async () => {
          const result = await fetchEndpoint(
            splitBlock,
            { id: blockId },
            { body: { position, ...(opts ?? {}) } },
          );
          pendingFocusRef.current = result.created.id;
          const handle = focusHandlesRef.current.get(result.created.id);
          if (handle) {
            pendingFocusRef.current = null;
            handle.focus();
          }
        })();
      },
      merge() {
        void (async () => {
          try {
            const merged = await fetchEndpoint(mergeBlocks, { id: blockId });
            focusHandlesRef.current.get(merged.id)?.focus();
          } catch (err: unknown) {
            if (err instanceof EndpointError && err.status === 400) return;
            throw err;
          }
        })();
      },
      remove() {
        void fetchEndpoint(deleteBlock, { id: blockId });
      },
      indent() {
        void (async () => {
          try {
            await fetchEndpoint(indentBlock, { id: blockId });
          } catch (err: unknown) {
            // 400 = no previous sibling to indent under; benign no-op.
            if (err instanceof EndpointError && err.status === 400) return;
            throw err;
          }
        })();
      },
      outdent() {
        void (async () => {
          try {
            await fetchEndpoint(outdentBlock, { id: blockId });
          } catch (err: unknown) {
            // 400 = already at top level; benign no-op.
            if (err instanceof EndpointError && err.status === 400) return;
            throw err;
          }
        })();
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
    [],
  );

  return (
    <BlockEditorContext.Provider
      value={{
        pageId,
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
