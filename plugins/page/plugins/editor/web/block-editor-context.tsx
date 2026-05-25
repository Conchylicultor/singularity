import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import {
  updateBlock,
  splitBlock,
  mergeBlocks,
  deleteBlock,
  indentBlock,
  outdentBlock,
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
        void fetchEndpoint(indentBlock, { id: blockId });
      },
      outdent() {
        void fetchEndpoint(outdentBlock, { id: blockId });
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
      }}
    >
      {children}
    </BlockEditorContext.Provider>
  );
}
