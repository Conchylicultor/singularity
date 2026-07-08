// Dependency-inversion seam for the read-set shrink signal. `persistSnapshot`
// (this plugin, DB infra) DETECTS when a persist replaces a resource's durable
// `tables_read` with a STRICT-SUBSET (a dropped dependency) and emits an event;
// the debug/read-set-shrink monitor SUBSCRIBES in its onReady and files a
// Debug → Reports signal for human confirmation. Keeping the seam here (not a
// direct reports import) preserves the DAG: database-infra never depends on
// reports/debug. Mirrors runtime-profiler's onResourcePush hook shape. See
// research/2026-07-08-global-read-set-shrink-guard.md.
export interface ReadSetShrinkEvent {
  resourceKey: string;
  /** Tables the previously-persisted set had that the new set drops. */
  droppedTables: string[];
  /** The full previously-persisted read-set. */
  oldTables: string[];
  /** The full read-set now being persisted. */
  newTables: string[];
}

let handler: ((e: ReadSetShrinkEvent) => void) | null = null;

// Register the (single, process-lifetime) shrink observer. Last-writer-wins;
// there is only one consumer (the monitor plugin).
export function onReadSetShrink(cb: (e: ReadSetShrinkEvent) => void): void {
  handler = cb;
}

// Called by persistSnapshot on a detected shed. Synchronous + best-effort: the
// registered handler is a pure in-memory accumulator write, so this never touches
// async I/O on the persist path and never throws into it.
export function emitReadSetShrink(e: ReadSetShrinkEvent): void {
  handler?.(e);
}
