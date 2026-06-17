import { useCallback, useMemo } from "react";
import type { ScopedStore } from "@plugins/primitives/plugins/scoped-store/web";
import {
  canRedo as selectCanRedo,
  canUndo as selectCanUndo,
  popRedo,
  popUndo,
  recordEntry,
  type HistoryEntry,
} from "./stack";
import { UndoRedoStore, UndoRedoThunkError, type UndoRedoState } from "./store";

/** Public command-history API returned by {@link useUndoRedo}. */
export interface UndoRedoApi {
  /** Record a reversible command (with optional coalescing). No-op while replaying. */
  record(entry: HistoryEntry): void;
  /** Undo the most recent command. No-op when `canUndo` is false. */
  undo(): void;
  /** Redo the most recently undone command. No-op when `canRedo` is false. */
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** Drop both stacks. */
  clear(): void;
}

/**
 * Run an `undo`/`redo` thunk inside the re-entrancy guard. The thunk's reverse
 * patch usually re-enters `record`, which must be ignored — so `replaying` is
 * raised before the thunk and lowered after (even on throw). The thunk may be
 * async; failures are surfaced loudly as an {@link UndoRedoThunkError}.
 */
async function runGuarded(
  store: ScopedStore<UndoRedoState>,
  direction: "undo" | "redo",
  thunk: () => void | Promise<void>,
): Promise<void> {
  store.setState((s) => ({ ...s, replaying: true }));
  try {
    await thunk();
  } catch (err) {
    throw new UndoRedoThunkError(direction, err);
  } finally {
    store.setState((s) => ({ ...s, replaying: false }));
  }
}

export function useUndoRedo(): UndoRedoApi {
  // Throws the scoped-store "hook used outside its <Provider>" error when there
  // is no <UndoRedoProvider> above — which is the required loud failure.
  const store = UndoRedoStore.useStoreApi();

  const record = useCallback(
    (entry: HistoryEntry) => {
      const s = store.getState();
      if (s.replaying) return; // reverse/forward patch from a running thunk — ignore.
      const next = recordEntry(s, entry, Date.now(), s.maxDepth);
      store.setState((prev) => ({ ...next, replaying: prev.replaying, maxDepth: prev.maxDepth }));
    },
    [store],
  );

  const undo = useCallback(() => {
    const popped = popUndo(store.getState());
    if (popped === null) return;
    store.setState((prev) => ({ ...popped.state, replaying: prev.replaying, maxDepth: prev.maxDepth }));
    void runGuarded(store, "undo", popped.entry.undo);
  }, [store]);

  const redo = useCallback(() => {
    const popped = popRedo(store.getState());
    if (popped === null) return;
    store.setState((prev) => ({ ...popped.state, replaying: prev.replaying, maxDepth: prev.maxDepth }));
    void runGuarded(store, "redo", popped.entry.redo);
  }, [store]);

  const clear = useCallback(() => {
    store.setState((prev) => ({ past: [], future: [], replaying: false, maxDepth: prev.maxDepth }));
  }, [store]);

  const canUndo = UndoRedoStore.useSelector((s) => selectCanUndo(s), []);
  const canRedo = UndoRedoStore.useSelector((s) => selectCanRedo(s), []);

  return useMemo(
    () => ({ record, undo, redo, canUndo, canRedo, clear }),
    [record, undo, redo, canUndo, canRedo, clear],
  );
}
