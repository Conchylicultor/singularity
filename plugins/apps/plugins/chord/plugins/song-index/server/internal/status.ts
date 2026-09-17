import type { IndexPhase, IndexStatus, LoadScope } from "../../core";

// ── Pure rules over the two singleton rows ───────────────────────────────────

/** What a load produces, and what an index must have been loaded at to count as current. */
export type IndexTarget = {
  snapshotName: string;
  scope: LoadScope;
  derivationVersion: number;
};

/** The fields of `chord_index_state` these rules read. */
export type IndexStateView = IndexTarget & {
  phase: IndexPhase;
  done: number | null;
  total: number | null;
  windows: number | null;
  error: string | null;
};

/** Whether the index is loaded, at exactly this snapshot, scope and derivation version. */
export function isIndexCurrent(
  state: IndexStateView | null,
  target: IndexTarget,
): boolean {
  return (
    state !== null &&
    state.phase === "ready" &&
    state.snapshotName === target.snapshotName &&
    state.scope === target.scope &&
    state.derivationVersion === target.derivationVersion
  );
}

/**
 * The status the app shows. A request with no state row is a load the queue
 * has not started yet (`queued`). A `ready` row counts even when stale: its
 * rows still answer, and the reload that `ensure` or boot started flips it to
 * `loading` as soon as it runs.
 */
export function indexStatus(
  requested: boolean,
  state: IndexStateView | null,
): IndexStatus {
  if (!requested) return { kind: "not-requested" };
  if (state === null) {
    return { kind: "loading", phase: "queued", done: null, total: null };
  }
  switch (state.phase) {
    case "ready":
      return {
        kind: "ready",
        scope: state.scope,
        sections: requireCount(state.done, "done"),
        windows: requireCount(state.windows, "windows"),
      };
    case "failed":
      return {
        kind: "failed",
        error: state.error ?? "the load failed without a message",
      };
    case "downloading":
    case "building-snapshot":
    case "loading":
      return {
        kind: "loading",
        phase: state.phase,
        done: state.done,
        total: state.total,
      };
  }
}

function requireCount(value: number | null, field: string): number {
  if (value === null) {
    throw new Error(
      `chord_index_state is ready but its ${field} count is null — the load that marked it ready did not record it`,
    );
  }
  return value;
}
