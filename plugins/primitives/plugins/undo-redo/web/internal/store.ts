import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";
import { DEFAULT_MAX_DEPTH, emptyHistory, type HistoryState } from "./stack";

/**
 * The full reactive store state: the command history, the depth cap, and a
 * re-entrancy guard.
 *
 * `replaying` is set while an `undo`/`redo` thunk runs. The host's reverse/forward
 * patch typically flows back through the SAME recording path, so without this
 * guard an undo would record itself as a new command (and clobber `future`).
 * `record` ignores calls while `replaying` is true.
 *
 * `maxDepth` lives in state (seeded from the `<UndoRedoProvider maxDepth>` prop)
 * so the stable `record` callback can read it without re-binding on a prop change.
 */
export interface UndoRedoState extends HistoryState {
  replaying: boolean;
  maxDepth: number;
}

export function initialState(maxDepth = DEFAULT_MAX_DEPTH): UndoRedoState {
  return { ...emptyHistory(), replaying: false, maxDepth };
}

/** Module-level factory; STATE is per-`<Provider>` mount (one history per surface). */
export const UndoRedoStore = defineScopedStore<UndoRedoState>(() => initialState());

/**
 * Thrown when a consumer's `undo`/`redo` thunk rejects. The error is surfaced
 * loudly (rethrown out of the async runner) rather than swallowed — a failed
 * inverse patch is a structural bug the host must see.
 */
export class UndoRedoThunkError extends Error {
  constructor(
    readonly direction: "undo" | "redo",
    cause: unknown,
  ) {
    super(`undo-redo: ${direction} thunk threw`, { cause });
    this.name = "UndoRedoThunkError";
  }
}
