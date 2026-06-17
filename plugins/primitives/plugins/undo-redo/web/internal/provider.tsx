import type { ReactNode } from "react";
import { DEFAULT_MAX_DEPTH } from "./stack";
import { UndoRedoStore, initialState } from "./store";

export interface UndoRedoProviderProps {
  children: ReactNode;
  /** Max number of past entries retained; oldest drop past this. Default 200. */
  maxDepth?: number;
}

/**
 * Provides a surface-scoped command-history stack to its subtree. Renders no
 * visible UI — it only mounts the scoped store (one independent history per
 * `<UndoRedoProvider>` mount, i.e. per surface tab).
 */
export function UndoRedoProvider({
  children,
  maxDepth = DEFAULT_MAX_DEPTH,
}: UndoRedoProviderProps): ReactNode {
  return (
    <UndoRedoStore.Provider initial={() => initialState(maxDepth)}>
      {children}
    </UndoRedoStore.Provider>
  );
}
