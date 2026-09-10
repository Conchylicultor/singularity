import { useCallback, useMemo } from "react";
import type { ScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import {
  dropScope as dropScopeEntries,
  canRedo as selectCanRedo,
  canUndo as selectCanUndo,
  popRedo,
  popUndo,
  recordEntry,
  type HistoryEntry,
} from "./stack";
import {
  UndoRedoStore,
  UndoRedoThunkError,
  type PendingFlush,
  type ReplayDirection,
  type UndoRedoState,
} from "./store";

/** Public command-history API returned by {@link useUndoRedo}. */
export interface UndoRedoApi {
  /**
   * Record a reversible command (with optional coalescing). No-op only while a
   * replay thunk's SYNCHRONOUS call is on the stack (its re-entrant echo); a
   * record during an async thunk's round trip lands.
   */
  record(entry: HistoryEntry): void;
  /**
   * Undo the most recent command. Runs every registered pending flush first,
   * then pops. A call while a thunk is in flight queues behind it (FIFO); a
   * turn that finds nothing to pop is a no-op.
   */
  undo(): void;
  /** Redo the most recently undone command. Same flush + queue semantics as `undo`. */
  redo(): void;
  /**
   * The recorded stack as it stands — not counting entries a pending flush
   * would still seal, nor turns still waiting in the queue.
   */
  canUndo: boolean;
  canRedo: boolean;
  /** Drop both stacks. */
  clear(): void;
  /**
   * Drop every entry tagged with `scope` (see {@link HistoryEntry.scope}).
   * Called when the mount those entries' thunks close over goes away — see
   * `useScopedUndoRedo`, which owns the scope + the unmount cleanup.
   */
  dropScope(scope: string): void;
  /**
   * Register a {@link PendingFlush}: a producer's "seal what you are holding"
   * callback, run synchronously at the start of every `undo`/`redo` turn
   * before the pop, outside the replay guard — so its `record` lands as the
   * top entry. Returns the unregister. Prefer `usePendingFlush`, which binds
   * the registration to a mount.
   */
  registerPendingFlush(flush: PendingFlush): () => void;
}

function pop(
  state: UndoRedoState,
  direction: ReplayDirection,
): ReturnType<typeof popUndo> {
  return direction === "undo" ? popUndo(state) : popRedo(state);
}

/**
 * One turn: seal, pop, replay, hand over. Synchronous through the thunk's first
 * `await` — when the queue is idle, `undo()` has flushed, popped and started the
 * thunk by the time it returns, exactly as a plain call would.
 *
 * Three phases, each with the state it needs:
 *  1. Every registered flush runs with `replaying` LOWERED. A flush is a
 *     producer sealing a not-yet-recorded entry; its `record` must land, so it
 *     can never run under the guard.
 *  2. The pop, and the thunk's SYNCHRONOUS part under the guard: `replaying`
 *     is raised before the thunk is called and lowered the moment the call
 *     returns (even on a synchronous throw) — NOT held across the `await`. The
 *     guard exists for one thing: a reverse/forward patch the thunk dispatches
 *     synchronously and that flows straight back through `record` (a
 *     re-entrant echo), which must be ignored rather than recorded as a
 *     brand-new command. An async thunk's later continuation dispatches
 *     nothing that records itself, while a `record` from an unrelated producer
 *     during its round trip (a typing run the idle timer closes while a
 *     stored-doc replay is in flight) is a REAL entry that must land — under a
 *     guard held across the await it was silently dropped. A rejection, sync
 *     or async, surfaces as an {@link UndoRedoThunkError}.
 *  3. Hand-over, in `finally` so a failed turn never wedges the queue: this
 *     turn leaves `turns`, and the next waiting one starts as its own
 *     fire-and-forget promise (its failure is its own).
 */
async function runTurn(
  store: ScopedStore<UndoRedoState>,
  direction: ReplayDirection,
): Promise<void> {
  try {
    for (const flush of store.getState().flushes) flush();
    const popped = pop(store.getState(), direction);
    if (popped === null) return;
    store.setState((prev) => ({ ...prev, ...popped.state }));
    try {
      await startThunk(store, direction, popped.entry);
    } catch (err) {
      throw new UndoRedoThunkError(direction, err);
    }
  } finally {
    const [, ...waiting] = store.getState().turns;
    store.setState((prev) => ({ ...prev, turns: waiting }));
    const next = waiting[0];
    if (next !== undefined) void runTurn(store, next);
  }
}

/**
 * Call the entry's thunk with `replaying` raised for exactly the synchronous
 * span of the call. Returns the thunk's settlement (a sync thunk settles at
 * once; a sync throw propagates through the `finally`, so the guard is never
 * left raised). The caller awaits the settlement OUTSIDE the guard.
 */
function startThunk(
  store: ScopedStore<UndoRedoState>,
  direction: ReplayDirection,
  entry: HistoryEntry,
): Promise<void> {
  store.setState((prev) => ({ ...prev, replaying: true }));
  try {
    return Promise.resolve(direction === "undo" ? entry.undo() : entry.redo());
  } finally {
    store.setState((prev) => ({ ...prev, replaying: false }));
  }
}

/** Queue a turn; start it now when nothing is in flight. */
function requestTurn(
  store: ScopedStore<UndoRedoState>,
  direction: ReplayDirection,
): void {
  const idle = store.getState().turns.length === 0;
  store.setState((prev) => ({ ...prev, turns: [...prev.turns, direction] }));
  if (idle) void runTurn(store, direction);
}

export function useUndoRedo(): UndoRedoApi {
  // Throws the scoped-store "hook used outside its <Provider>" error when there
  // is no <UndoRedoProvider> above — which is the required loud failure.
  const store = UndoRedoStore.useStoreApi();

  const record = useCallback(
    (entry: HistoryEntry) => {
      const s = store.getState();
      if (s.replaying) return; // a thunk's synchronous re-entrant echo — ignore.
      const next = recordEntry(s, entry, Date.now(), s.maxDepth);
      store.setState((prev) => ({ ...prev, ...next }));
    },
    [store],
  );

  const undo = useCallback(() => requestTurn(store, "undo"), [store]);
  const redo = useCallback(() => requestTurn(store, "redo"), [store]);

  const clear = useCallback(() => {
    store.setState((prev) => ({ ...prev, past: [], future: [] }));
  }, [store]);

  const dropScope = useCallback(
    (scope: string) => {
      store.setState((prev) => ({ ...prev, ...dropScopeEntries(prev, scope) }));
    },
    [store],
  );

  const registerPendingFlush = useCallback(
    (flush: PendingFlush) => {
      store.setState((prev) => {
        const flushes = new Set(prev.flushes);
        flushes.add(flush);
        return { ...prev, flushes };
      });
      return () => {
        store.setState((prev) => {
          if (!prev.flushes.has(flush)) return prev;
          const flushes = new Set(prev.flushes);
          flushes.delete(flush);
          return { ...prev, flushes };
        });
      };
    },
    [store],
  );

  const canUndo = UndoRedoStore.useSelector((s) => selectCanUndo(s), []);
  const canRedo = UndoRedoStore.useSelector((s) => selectCanRedo(s), []);

  return useMemo(
    () => ({
      record,
      undo,
      redo,
      canUndo,
      canRedo,
      clear,
      dropScope,
      registerPendingFlush,
    }),
    [
      record,
      undo,
      redo,
      canUndo,
      canRedo,
      clear,
      dropScope,
      registerPendingFlush,
    ],
  );
}
