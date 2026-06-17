/**
 * Pure command-history stack reducers. Domain-agnostic and React-free so the
 * push/coalesce/undo/redo logic is unit-testable without a store or a DOM.
 *
 * The store ({@link ./store}) holds a {@link HistoryState} and calls these to
 * derive the next state; running the actual `undo`/`redo` thunks is the store's
 * job (this layer never invokes side effects).
 */

/** One reversible command: a forward (`redo`) action and its inverse (`undo`). */
export interface HistoryEntry {
  /** Human label for tooltips / menus ("Undo move block"). */
  label?: string;
  /** Apply the reverse patch. May be async. */
  undo: () => void | Promise<void>;
  /** Re-apply the forward patch. May be async. */
  redo: () => void | Promise<void>;
  /**
   * Adjacent entries sharing this key, recorded within `coalesceWindowMs` of
   * each other, merge into one (keep the first entry's `undo`, take the latest
   * entry's `redo`). Unset = never coalesce.
   */
  coalesceKey?: string;
  /** Coalesce window in ms (default {@link DEFAULT_COALESCE_WINDOW_MS}). */
  coalesceWindowMs?: number;
}

/** A recorded entry plus the wall-clock time it was recorded (for coalescing). */
interface StampedEntry {
  entry: HistoryEntry;
  /** `Date.now()` at record time. */
  at: number;
}

export interface HistoryState {
  past: StampedEntry[];
  future: StampedEntry[];
}

export const DEFAULT_COALESCE_WINDOW_MS = 500;
export const DEFAULT_MAX_DEPTH = 200;

export function emptyHistory(): HistoryState {
  return { past: [], future: [] };
}

/** Read-only views for the api (drops the internal timestamp). */
export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}
export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

/**
 * Record a fresh command. Coalesces into the top-of-`past` entry when the new
 * entry shares its `coalesceKey` and arrives within the window; otherwise pushes
 * a new entry. Either way `future` is cleared (a new action invalidates redo)
 * and `past` is capped to `maxDepth` by dropping the oldest entries.
 *
 * `now` is injected (the store passes `Date.now()`) so this stays pure/testable.
 */
export function recordEntry(
  state: HistoryState,
  entry: HistoryEntry,
  now: number,
  maxDepth: number,
): HistoryState {
  const top = state.past.at(-1);
  const window = entry.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS;

  const canCoalesce =
    entry.coalesceKey !== undefined &&
    top !== undefined &&
    top.entry.coalesceKey === entry.coalesceKey &&
    now - top.at <= window;

  let past: StampedEntry[];
  if (canCoalesce && top !== undefined) {
    // Merge: keep the existing entry's inverse (the original "before"), adopt
    // the new entry's forward action and label (the latest "after").
    const merged: StampedEntry = {
      at: now,
      entry: {
        ...top.entry,
        label: entry.label ?? top.entry.label,
        redo: entry.redo,
      },
    };
    past = [...state.past.slice(0, -1), merged];
  } else {
    past = [...state.past, { entry, at: now }];
  }

  if (past.length > maxDepth) past = past.slice(past.length - maxDepth);

  return { past, future: [] };
}

/**
 * Move the top `past` entry to `future` and return it for the store to run.
 * Returns `null` (state unchanged) when there is nothing to undo.
 */
export function popUndo(
  state: HistoryState,
): { state: HistoryState; entry: HistoryEntry } | null {
  const top = state.past.at(-1);
  if (top === undefined) return null;
  return {
    state: { past: state.past.slice(0, -1), future: [...state.future, top] },
    entry: top.entry,
  };
}

/** Symmetric to {@link popUndo}: move the top `future` entry back to `past`. */
export function popRedo(
  state: HistoryState,
): { state: HistoryState; entry: HistoryEntry } | null {
  const top = state.future.at(-1);
  if (top === undefined) return null;
  return {
    state: { past: [...state.past, top], future: state.future.slice(0, -1) },
    entry: top.entry,
  };
}
