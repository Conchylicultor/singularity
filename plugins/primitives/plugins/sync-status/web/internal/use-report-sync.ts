import { useContext, useEffect, useId } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { SyncStatusSinkContext } from "./sink-context";
import { applyReport, removeReport, type SyncPhase } from "./store";

/**
 * What an optimistic / autosave surface reports each render. `phase` is the
 * current lifecycle; `label` names the thing being saved (shown in the error
 * state); `retry` re-runs the failed save and is only meaningful while
 * `phase === "error"`; `savedAt` is the reporter's own "my save completed"
 * timestamp (set once a save succeeds, kept stable thereafter) — it drives the
 * "Saved" state explicitly instead of the store inferring it from a transition.
 */
export interface ReportSyncArgs {
  phase: SyncPhase;
  label?: string;
  retry?: () => void;
  savedAt?: number | null;
}

/**
 * Declarative sync reporter. A surface calls this every render with its current
 * `{ phase, label, retry }`; the hook writes the surface-scoped sync store so
 * the universal `<SyncStatusIndicator/>` reflects it. The author writes no
 * indicator code — using the hook is the whole contribution.
 *
 * - A stable id is minted with `useId()` so the same reporter always owns the
 *   same store entry across renders.
 * - The `retry` thunk is held in a ref (registered in the sink's retry map) so a
 *   fresh closure each render never thrashes the store; the indicator pulls it
 *   imperatively.
 * - On unmount the entry is removed and the retry deregistered.
 * - **No-Provider tolerance:** the sink context defaults to a no-op sink, so
 *   outside a `<SyncStatusProvider>` (unit tests, non-surface mounts) the hook
 *   is a harmless no-op rather than a throw.
 */
export function useReportSync({
  phase,
  label,
  retry,
  savedAt,
}: ReportSyncArgs): void {
  const id = useId();
  const sink = useContext(SyncStatusSinkContext);

  // Hold retry in a ref so its identity churn never feeds the effect deps.
  const retryRef = useLatestRef(retry);

  // Register the retry ref in the sink so the indicator can pull it.
  useEffect(() => {
    sink.retries.set(id, retryRef);
    return () => {
      sink.retries.delete(id);
    };
  }, [sink, id, retryRef]);

  // Update the store entry whenever the reported phase/label/savedAt changes.
  // No cleanup here: removing-then-reapplying on a phase change would drop the
  // entry mid-flight. `savedAt` is the reporter's explicit save-completed
  // timestamp; `applyReport`'s no-op bail keeps re-reports of the same value
  // from looping. Depends only on [sink, id, phase, label, savedAt] — never on
  // `retry`.
  useEffect(() => {
    sink.setState((state) => applyReport(state, id, phase, label, savedAt));
  }, [sink, id, phase, label, savedAt]);

  // Remove the entry on unmount only (or when the surface re-keys). Kept
  // separate from the apply effect so a phase change never tears down the entry.
  useEffect(() => {
    return () => {
      sink.setState((state) => removeReport(state, id));
    };
  }, [sink, id]);
}
