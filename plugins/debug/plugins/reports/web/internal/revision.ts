import { useEffect, useRef } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { reportsRevisionResource } from "@plugins/reports/core";

/** Module-level so the selector reference is stable across every mount. */
const selectRev = (d: { rev: number }): number => d.rev;

/**
 * The `reports.revision` tick as a DataView `changeTick`: `null` while pending
 * (no refetch), then the settled `rev` — the first one refreshes once.
 */
export function useReportsChangeTick(): number | null {
  // `select` narrows the subscription and the re-render to the one scalar.
  const tick = useResource(reportsRevisionResource, undefined, {
    select: selectRev,
  });
  return tick.pending ? null : tick.data;
}

/**
 * Refetch an endpoint read in place whenever `reports.revision` moves.
 *
 * The tick stays OUT of the query key (the `useRun` precedent): a tick in the key
 * would mint a fresh cache entry per move and drop the surface back to its
 * loading state while a value it already has is re-read. Compared against a ref
 * so the first render never refetches what it just asked for.
 */
export function useRefetchOnReportsRevision(refetch: () => unknown): void {
  const changeTick = useReportsChangeTick();
  const lastTickRef = useRef<number | null>(changeTick);
  useEffect(() => {
    if (lastTickRef.current === changeTick) return;
    lastTickRef.current = changeTick;
    // A freshness nudge: the query owns its own error state.
    void refetch();
  }, [changeTick, refetch]);
}
