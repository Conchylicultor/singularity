import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useResource, queryKeyFor } from "@plugins/primitives/plugins/live-state/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";
import {
  confirmPass,
  markResolved,
  removeOp,
  replay,
  type PendingOp,
} from "./overlay";

export interface UseOptimisticResourceArgs<
  Data,
  Vars,
  P extends Record<string, string> = Record<string, string>,
> {
  resource: ResourceDescriptor<Data, P>;
  params?: P;
  /** Pure predicted next state. Must not mutate `current`. */
  apply: (current: Data, vars: Vars) => Data;
  /** Network thunk; resolves on server 2xx (the op was accepted). */
  mutate: (vars: Vars) => Promise<void>;
  /**
   * Has this freshly-arrived server snapshot already reflected `vars`?
   * Default (coarse): clear a resolved op on the first push after it resolved.
   * Override for precise content checks (e.g. "row id X present").
   */
  isConfirmedBy?: (serverData: Data, vars: Vars) => boolean;
  /**
   * Op identity for cascade confirmation (content-based mode only): do `a` and
   * `b` write the SAME entity/key? When provided, confirming an op also drops
   * older RESOLVED ops on the same target — a newer confirmed write to a
   * target proves the snapshot already contains the older write's (possibly
   * overwritten) effect, so an older op that still doesn't match can never
   * match any future snapshot (the stuck-inverse-pair hazard; see
   * `confirmPass`). Without it, only directly-confirmed ops are dropped —
   * older resolved ops on UNRELATED targets always survive until their own
   * confirming push arrives.
   */
  sameTarget?: (a: Vars, b: Vars) => boolean;
  onError?: (err: unknown, vars: Vars) => void;
  /** Names the thing being saved; surfaced in the sync-status error state. */
  label?: string;
}

export interface UseOptimisticResourceResult<Data, Vars> {
  /** Server truth with all pending ops replayed; never undefined. */
  data: Data;
  /**
   * Raw authoritative server truth — the overlay base, with NO pending ops
   * applied (`resource.initialData` until the first push). For consumers that
   * must distinguish "the server has really absorbed this row" from the
   * optimistic prediction (e.g. gating a dependent write on a row's real,
   * FK-satisfying existence).
   */
  serverData: Data;
  /** Forwarded from useResource (true until the first authoritative value). */
  pending: boolean;
  /** Enqueue an overlay op + fire `mutate`; returns the minted opId. */
  dispatch: (vars: Vars) => string;
  inFlight: ReadonlyArray<{ opId: string; vars: Vars }>;
  /**
   * Ops whose `mutate` rejected. The overlay has been rolled back, but the op is
   * retained here (with its `vars`) so the surface can report an error and offer
   * a retry. Cleared when the op is retried or re-dispatched.
   */
  failed: ReadonlyArray<{ opId: string; vars: Vars }>;
  /** Drop a failed op and re-run it (re-`dispatch(vars)`). */
  retry: (opId: string) => void;
}

export function useOptimisticResource<
  Data,
  Vars,
  P extends Record<string, string> = Record<string, string>,
>(
  args: UseOptimisticResourceArgs<Data, Vars, P>,
): UseOptimisticResourceResult<Data, Vars> {
  const { resource, params, apply, mutate, isConfirmedBy, sameTarget, onError, label } = args;
  const queryClient = useQueryClient();
  const result = useResource(resource, params);
  const base = result.pending ? resource.initialData : result.data;

  const [pending, setPending] = useState<ReadonlyArray<PendingOp<Vars>>>([]);
  const [failed, setFailed] = useState<ReadonlyArray<{ opId: string; vars: Vars }>>([]);
  // Explicit "all in-flight ops confirmed" timestamp, reported to sync-status.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Latest-value refs so the QueryCache subscription effect can stay mounted for
  // the resource's lifetime without re-subscribing on every render.
  const applyRef = useLatestRef(apply);
  const isConfirmedByRef = useLatestRef(isConfirmedBy);
  const sameTargetRef = useLatestRef(sameTarget);

  const targetKey = useMemo(
    () => JSON.stringify(queryKeyFor(resource.key, params)),
    [resource.key, params],
  );

  // Subscribe to the TanStack QueryCache: every authoritative push (the WS path
  // does setQueryData → an "updated" cache event for our exact key) runs the
  // confirmation pass and drops the resolved ops the server has absorbed.
  // No polling — this is push-driven by the cache itself.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((event) => {
      if (event.type !== "updated") return;
      if (JSON.stringify(event.query.queryKey) !== targetKey) return;
      const serverData = event.query.state.data as Data | undefined;
      if (serverData === undefined) return;
      setPending((prev) => {
        const next = confirmPass(prev, serverData, isConfirmedByRef.current, sameTargetRef.current);
        return next.length === prev.length ? prev : next;
      });
    });
    // The subscription stays mounted for the resource's lifetime and reads the
    // freshest predicate off the stable `isConfirmedByRef.current` at call time.
  }, [queryClient, targetKey]);

  const data = useMemo(
    // `applyRef` (stable useLatestRef handle) is read through `.current` at
    // compute time; recompute is intentionally keyed on base/pending only — apply
    // identity churn must NOT invalidate the overlay.
    // eslint-disable-next-line react-hooks/refs -- intentional latest-reducer read inside the overlay memo (see above); the read is render-phase by design and the ref is stable
    () => replay(base, pending, applyRef.current),
    [base, pending],
  );

  const dispatch = useCallback(
    (vars: Vars): string => {
      const opId = crypto.randomUUID();
      setPending((prev) => [...prev, { opId, vars, resolved: false }]);
      void mutate(vars).then(
        () => setPending((prev) => markResolved(prev, opId)),
        (err: unknown) => {
          // Reject = rollback: removing the op recomputes the overlay without it
          // (the cache was never mutated, so there is nothing else to undo). The
          // op is then retained in `failed` so the surface can report the error
          // and offer a retry, instead of the failure silently vanishing.
          setPending((prev) => removeOp(prev, opId));
          setFailed((prev) => [...prev, { opId, vars }]);
          if (onError) onError(err, vars);
        },
      );
      return opId;
    },
    [mutate, onError],
  );

  // Hold dispatch in a ref so `retry` keeps a stable identity even as dispatch's
  // deps (mutate/onError) churn between renders.
  const dispatchRef = useLatestRef(dispatch);

  // `retry` keeps a stable identity (useReportSync / the result memo depend on it
  // staying stable) and reads the freshest dispatch off `dispatchRef.current`.
  const retry = useCallback(
    (opId: string) => {
      let entry: { opId: string; vars: Vars } | undefined;
      setFailed((prev) => {
        entry = prev.find((f) => f.opId === opId);
        return prev.filter((f) => f.opId !== opId);
      });
      if (entry) dispatchRef.current(entry.vars);
    },
    [],
  );

  // Re-run only THIS hook's own failed ops. Held in a ref + stable wrapper so the
  // identity handed to useReportSync never churns (the indicator pulls it
  // imperatively), yet it always sees the latest failed list.
  const failedRef = useLatestRef(failed);
  // `retryAll` stays stable across renders (it re-derives only when `retry` does,
  // i.e. never), reading the freshest failed list off the stable
  // `failedRef.current` — so the identity handed to useReportSync never churns.
  const retryAll = useCallback(() => {
    failedRef.current.forEach((f) => retry(f.opId));
  }, [retry]);

  const inFlight = useMemo(
    () => pending.map((op) => ({ opId: op.opId, vars: op.vars })),
    [pending],
  );

  // Stamp an explicit "saved" timestamp the moment the last in-flight op clears
  // with no failures — the true "all confirmed" moment. A persistent state value
  // (unlike the transient inFlight/failed booleans) the sync-status store can
  // reliably observe. Track the previous in-flight count in a ref to detect the
  // >0 → 0 transition.
  const prevInFlightRef = useRef(inFlight.length);
  useEffect(() => {
    if (prevInFlightRef.current > 0 && inFlight.length === 0 && failed.length === 0) {
      setSavedAt(Date.now());
    }
    prevInFlightRef.current = inFlight.length;
  }, [inFlight.length, failed.length]);

  // Forced sync-status reporting: any optimistic surface lights up the universal
  // indicator with no indicator code of its own. Retry is wired to retryAll so
  // the indicator's Retry button re-runs only this hook's failed ops.
  const phase = failed.length ? "error" : inFlight.length ? "syncing" : "idle";
  useReportSync({
    phase,
    label,
    retry: failed.length ? retryAll : undefined,
    savedAt,
  });

  // Stable identity so the result can feed memo deps / combineResources gates.
  return useMemo(
    () => ({ data, serverData: base, pending: result.pending, dispatch, inFlight, failed, retry }),
    [data, base, result.pending, dispatch, inFlight, failed, retry],
  );
}
