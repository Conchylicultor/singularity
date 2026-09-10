import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import { DEFAULT_MAX_DEPTH, emptyHistory, type HistoryState } from "./stack";

/** Which way a turn replays: `undo` pops `past`, `redo` pops `future`. */
export type ReplayDirection = "undo" | "redo";

/**
 * A producer's "seal what you are holding" callback. A producer that coalesces
 * many small edits into one entry (a typing run) has, between the first edit
 * and its coalescing deadline, an entry that exists but is not yet recorded.
 * Every registered flush runs synchronously at the start of each `undo`/`redo`
 * turn, BEFORE the pop, so its `record` lands as the top entry and the stack
 * the user acts on is complete. Idempotent by contract: a flush with nothing
 * open records nothing.
 */
export type PendingFlush = () => void;

/**
 * The full reactive store state: the command history, the depth cap, the
 * registered pending flushes, the serialized turn queue, and a re-entrancy
 * guard.
 *
 * `replaying` is set ONLY for the SYNCHRONOUS span of an `undo`/`redo` thunk's
 * call (raised before the call, lowered when it returns — never held across
 * an async thunk's `await`). The host's reverse/forward patch typically flows
 * straight back through the SAME recording path, so without this guard an
 * undo would record itself as a new command (and clobber `future`). `record`
 * ignores calls while `replaying` is true — and nothing else: a pending flush
 * runs with it lowered, and a `record` from another producer during an async
 * thunk's round trip is a real entry that lands.
 *
 * `turns` is the serialized queue of `undo`/`redo` requests: `turns[0]` is the
 * turn in flight, the rest wait their turn in FIFO order. A request that
 * arrives while a thunk is in flight is queued behind it, never run
 * concurrently — so an entry recorded by a flush during the flight is popped
 * by the queued turn, and two rapid undos replay strictly LIFO.
 *
 * `flushes` is the per-mount registry of {@link PendingFlush} callbacks, in
 * registration order. Replaced immutably on (un)register so subscribers see it
 * like any other slice.
 *
 * `maxDepth` lives in state (seeded from the `<UndoRedoProvider maxDepth>` prop)
 * so the stable `record` callback can read it without re-binding on a prop change.
 */
export interface UndoRedoState extends HistoryState {
  replaying: boolean;
  maxDepth: number;
  flushes: ReadonlySet<PendingFlush>;
  turns: readonly ReplayDirection[];
}

export function initialState(maxDepth = DEFAULT_MAX_DEPTH): UndoRedoState {
  return {
    ...emptyHistory(),
    replaying: false,
    maxDepth,
    flushes: new Set(),
    turns: [],
  };
}

/** Module-level factory; STATE is per-`<Provider>` mount (one history per surface). */
export const UndoRedoStore = defineScopedStore<UndoRedoState>(() =>
  initialState(),
);

/**
 * Thrown when a consumer's `undo`/`redo` thunk rejects. The error is surfaced
 * loudly (rethrown out of the async runner) rather than swallowed — a failed
 * inverse patch is a structural bug the host must see. The message carries the
 * cause's own message so a crash report names the failure, not just the
 * direction; `cause` stays attached for the stack.
 */
export class UndoRedoThunkError extends Error {
  constructor(
    readonly direction: ReplayDirection,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`undo-redo: ${direction} thunk threw: ${reason}`, { cause });
    this.name = "UndoRedoThunkError";
  }
}
