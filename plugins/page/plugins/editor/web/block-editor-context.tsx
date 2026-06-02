import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  updateBlock,
  splitBlock,
  mergeBlocks,
  deleteBlock,
  indentBlock,
  outdentBlock,
  moveBlock,
  type Block,
} from "../core";
import type { BlockEditorAPI } from "./types";

interface BlockEditorContextValue {
  documentId: string;
  focusedBlockId: string | null;
  setFocusedBlockId: (id: string | null) => void;
  registerFocusHandle: (id: string, handle: { focus: () => void }) => () => void;
  makeBlockAPI: (blockId: string) => BlockEditorAPI;
  setFlatOrder: (blocks: Block[]) => void;
  move: (id: string, dest: { parentId: string | null; rank: Rank }) => void;
}

const BlockEditorContext = createContext<BlockEditorContextValue | null>(null);

export function useBlockEditor(): BlockEditorContextValue {
  const ctx = useContext(BlockEditorContext);
  if (!ctx) throw new Error("useBlockEditor must be used within a BlockEditorProvider");
  return ctx;
}

export function BlockEditorProvider({
  documentId,
  children,
}: {
  documentId: string;
  children: ReactNode;
}) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const focusHandlesRef = useRef(new Map<string, { focus: () => void }>());
  const flatOrderRef = useRef<Block[]>([]);
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

  const makeBlockAPI = useCallback(
    (blockId: string): BlockEditorAPI => ({
      update(data: unknown) {
        void fetchEndpoint(updateBlock, { id: blockId }, { body: { data } });
      },
      split(position: number) {
        void (async () => {
          const result = await fetchEndpoint(splitBlock, { id: blockId }, { body: { position } });
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
        documentId,
        focusedBlockId,
        setFocusedBlockId,
        registerFocusHandle,
        makeBlockAPI,
        setFlatOrder,
        move,
      }}
    >
      {children}
    </BlockEditorContext.Provider>
  );
}
