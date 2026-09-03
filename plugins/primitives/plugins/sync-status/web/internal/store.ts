import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";

/**
 * The lifecycle phase a single sync source reports. `idle` is the absence of a
 * source (the entry is removed), so only `syncing`/`conflict`/`error` are ever
 * stored.
 *
 * `conflict` is a DIFFERENT axis from `error`, not a softer one: nothing failed
 * and nothing is in flight — the source's own copy and the server's have moved
 * apart, and the source is holding the user's unsaved version. `error` means a
 * write was rejected and can be retried; retrying is meaningless here, so the
 * two can never share a phase.
 */
export type SyncPhase = "idle" | "syncing" | "conflict" | "error";

/** A single in-flight, diverged or failed sync source, keyed by the reporter's stable id. */
export interface SyncSource {
  phase: "syncing" | "conflict" | "error";
  /** Human label for the thing being saved (e.g. "title", "description"). */
  label?: string;
}

/**
 * Per-surface sync-status state. `sources` holds only the currently active
 * (syncing/error) reporters keyed by their `useId()`; `lastSavedAt` is the
 * timestamp of the most recent successful save, supplied explicitly by the
 * reporter via `savedAt` (drives the "Saved" state once nothing is in flight).
 */
export interface SyncStatusState {
  sources: Record<string, SyncSource>;
  lastSavedAt: number | null;
}

export function initialState(): SyncStatusState {
  return { sources: {}, lastSavedAt: null };
}

/** Module-level factory; STATE is per-`<Provider>` mount (one status per surface). */
export const SyncStatusStore = defineScopedStore<SyncStatusState>(() =>
  initialState(),
);

/**
 * Apply one reporter's report to the state. `phase` upserts (`syncing`/`error`)
 * or removes (`idle`) the source entry. `savedAt`, when provided, is the
 * reporter's own "my save completed" timestamp: it bumps `lastSavedAt` to
 * `max(lastSavedAt, savedAt)` regardless of phase. The reporter owns this fact
 * explicitly (a successful-save state update persists across renders), instead
 * of the store inferring it from a lossy `syncing → idle` transition that React
 * can coalesce away. The bail returns the SAME `state` reference when neither
 * the phase/label entry nor the computed `lastSavedAt` changed, so the
 * scoped-store's `Object.is` check prevents render loops (a reporter re-reports
 * the same `savedAt` every render after a save).
 */
export function applyReport(
  state: SyncStatusState,
  id: string,
  phase: SyncPhase,
  label: string | undefined,
  savedAt: number | null | undefined,
): SyncStatusState {
  const nextSavedAt =
    savedAt != null
      ? Math.max(state.lastSavedAt ?? 0, savedAt)
      : state.lastSavedAt;
  const savedChanged = nextSavedAt !== state.lastSavedAt;

  const prev = state.sources[id];
  if (phase === "idle") {
    if (!prev) {
      return savedChanged ? { ...state, lastSavedAt: nextSavedAt } : state;
    }
    const sources = { ...state.sources };
    delete sources[id];
    return { sources, lastSavedAt: nextSavedAt };
  }
  const phaseUnchanged = prev && prev.phase === phase && prev.label === label;
  if (phaseUnchanged && !savedChanged) return state;
  return {
    sources: { ...state.sources, [id]: { phase, label } },
    lastSavedAt: nextSavedAt,
  };
}

/** Remove a reporter's entry entirely (on unmount). No `lastSavedAt` bump. */
export function removeReport(
  state: SyncStatusState,
  id: string,
): SyncStatusState {
  if (!state.sources[id]) return state;
  const sources = { ...state.sources };
  delete sources[id];
  return { sources, lastSavedAt: state.lastSavedAt };
}

/**
 * The aggregate the indicator renders. Precedence is **error > conflict >
 * syncing > saved > idle**: any failed source surfaces as an error (with the
 * failing labels); else any diverged source surfaces as a conflict; else any
 * in-flight source is "syncing"; else a past save is "saved"; else there is
 * nothing to show. A conflict outranks "syncing" because an in-flight save is
 * routine and a divergence is the thing the user has to know about.
 */
export type SyncAggregate =
  | { kind: "error"; labels: string[] }
  | { kind: "conflict"; labels: string[] }
  | { kind: "syncing" }
  | { kind: "saved"; at: number }
  | { kind: "idle" };

export function aggregate(state: SyncStatusState): SyncAggregate {
  const entries = Object.values(state.sources);
  const errors = entries.filter((s) => s.phase === "error");
  if (errors.length > 0) return { kind: "error", labels: labelsOf(errors) };
  const diverged = entries.filter((s) => s.phase === "conflict");
  if (diverged.length > 0) {
    return { kind: "conflict", labels: labelsOf(diverged) };
  }
  if (entries.some((s) => s.phase === "syncing")) return { kind: "syncing" };
  if (state.lastSavedAt != null)
    return { kind: "saved", at: state.lastSavedAt };
  return { kind: "idle" };
}

/** The named subset of a phase's sources — unlabelled reporters contribute none. */
function labelsOf(sources: SyncSource[]): string[] {
  return sources.map((s) => s.label).filter((l): l is string => Boolean(l));
}
