import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useResource, queryKeyFor } from "@plugins/primitives/plugins/live-state/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";
import { optimisticDivergenceReportSink } from "../reporter";
import {
  confirmPass,
  removeOp,
  replay,
  resolvePass,
  type PendingOp,
} from "./overlay";

interface OptimisticBaseArgs<
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
  onError?: (err: unknown, vars: Vars) => void;
  /** Names the thing being saved; surfaced in the sync-status error state. */
  label?: string;
  /**
   * Short, bounded description of an op, used ONLY in the divergence report
   * (`vars` itself is unbounded and possibly unserializable, so it is never
   * shipped). Must be pure and total — it runs on the reconcile path, and a
   * throw propagates loudly rather than being swallowed.
   */
  describeOp?: (vars: Vars) => string;
}

/**
 * Confirmation mode. Coarse (neither field) clears a resolved op once an
 * authoritative push has landed since it was dispatched. Content-based REQUIRES
 * both fields together: `isConfirmedBy(serverData, vars)` asks "has this
 * server snapshot already reflected `vars`?" (precise content check, e.g. "row
 * id X present"), and `sameTarget(a, b)` declares op identity ("do `a` and `b`
 * write the SAME entity/key?").
 *
 * Precise per-op matching implies concurrent per-entity ops in flight — i.e. a
 * structurally multi-target consumer — which needs the same-target cascade to
 * avoid the stuck-inverse-pair replay: confirming an op also drops older
 * RESOLVED ops on the same target, because a newer confirmed write to a target
 * proves the snapshot already contains the older write's (possibly overwritten)
 * effect, so an older op that still doesn't match can never match any future
 * snapshot (see `confirmPass`). An older resolved op on an UNRELATED target,
 * whose own confirming push simply hasn't arrived yet, is never cascade-dropped.
 *
 * `isConfirmedBy` without `sameTarget` (or vice versa) is therefore
 * unrepresentable.
 */
type ConfirmationArgs<Data, Vars> =
  | { isConfirmedBy?: undefined; sameTarget?: undefined }
  | {
      isConfirmedBy: (serverData: Data, vars: Vars) => boolean;
      sameTarget: (a: Vars, b: Vars) => boolean;
    };

export type UseOptimisticResourceArgs<
  Data,
  Vars,
  P extends Record<string, string> = Record<string, string>,
> = OptimisticBaseArgs<Data, Vars, P> & ConfirmationArgs<Data, Vars>;

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
  /**
   * Every op still in the overlay — including ones the server has already
   * ACKED but whose confirming push hasn't been matched yet. This is the
   * replay set, NOT the "is anything unsaved" signal: read `saving` for that.
   */
  pendingOps: ReadonlyArray<{ opId: string; vars: Vars }>;
  /** True while at least one op's `mutate` has not come back yet. */
  saving: boolean;
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
  const { resource, params, apply, mutate, onError, label, describeOp } = args;
  // Narrow on the object (not a destructure) so TS keeps the union correlation:
  // when `args.isConfirmedBy` is truthy, `args` is the paired arm and
  // `args.sameTarget` is known-defined.
  const confirmation = args.isConfirmedBy
    ? { isConfirmedBy: args.isConfirmedBy, sameTarget: args.sameTarget }
    : undefined;
  const queryClient = useQueryClient();
  const result = useResource(resource, params);
  const base = result.pending ? resource.initialData : result.data;

  const [pending, setPending] = useState<ReadonlyArray<PendingOp<Vars>>>([]);
  const [failed, setFailed] = useState<ReadonlyArray<{ opId: string; vars: Vars }>>([]);
  // Explicit "everything this hook dispatched has been acked" timestamp,
  // reported to sync-status. Stamped inside the resolve handler, never inferred
  // from a derived boolean (a transient boolean can be coalesced away within one
  // React render — the exact hazard sync-status/CLAUDE.md documents).
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Commit mirror of `pending`. Every lifecycle edge (dispatch / resolve /
  // reject / push) fires from an event or promise callback, decides the next
  // overlay against this ref, and writes both. A functional `setPending` updater
  // cannot be used: the pure machine returns `{ pending, diverged }`, and
  // extracting `diverged` from inside an updater would make the updater
  // effectful (React may invoke it twice). Sequential edges within one tick
  // chain correctly because the ref is written synchronously.
  const pendingRef = useRef<ReadonlyArray<PendingOp<Vars>>>([]);
  const commitPending = useCallback((next: ReadonlyArray<PendingOp<Vars>>) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  // Latest-value refs so the QueryCache subscription effect can stay mounted for
  // the resource's lifetime without re-subscribing on every render.
  const applyRef = useLatestRef(apply);
  const confirmationRef = useLatestRef(confirmation);
  const describeOpRef = useLatestRef(describeOp);
  const labelRef = useLatestRef(label);
  const paramsRef = useLatestRef(params);
  const failedRef = useLatestRef(failed);

  const queryKey = useMemo(() => queryKeyFor(resource.key, params), [resource.key, params]);
  const queryKeyRef = useLatestRef(queryKey);
  const targetKey = useMemo(() => JSON.stringify(queryKey), [queryKey]);

  // The server durably disagrees with ops it already acked. Not a spinner state
  // (the write DID succeed) — a loud, deduped report, via the sanctioned sink
  // inversion (`error-boundary` → `reports.crash` is the precedent), because the
  // primitive must not import `reports`. `emit` never throws.
  const reportDiverged = useCallback(
    (diverged: ReadonlyArray<PendingOp<Vars>>) => {
      const describe = describeOpRef.current;
      optimisticDivergenceReportSink.emit({
        resourceKey: resource.key,
        params: paramsRef.current ?? null,
        label: labelRef.current ?? null,
        misses: Math.max(...diverged.map((op) => op.misses)),
        opSummaries: describe ? diverged.map((op) => describe(op.vars)) : [],
      });
    },
    // The latest-ref handles are stable; only the resource key participates.
    [resource.key],
  );

  // Last `dataUpdateCount` this hook has already reconciled against. See the
  // subscription below — the gate that turns "the cache changed" into "a new
  // authoritative snapshot landed".
  const lastGenRef = useRef(0);

  // Subscribe to the TanStack QueryCache: every authoritative push (the WS path
  // does setQueryData → a `success` action for our exact key) runs the
  // confirmation pass and drops the resolved ops the server has absorbed.
  // No polling — this is push-driven by the cache itself.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    // Re-baseline when the key changes: ops never outlive their (key, params).
    lastGenRef.current = queryClient.getQueryState<Data>(queryKeyRef.current)?.dataUpdateCount ?? 0;
    return cache.subscribe((event) => {
      if (event.type !== "updated") return;
      if (JSON.stringify(event.query.queryKey) !== targetKey) return;
      // A cache "updated" event does NOT mean a value arrived: query-core emits
      // one for EVERY state action (`fetch`, `error`, `invalidate`, `setState`,
      // …), all of which leave `state.data` untouched — often still the
      // `initialData` placeholder. Only the `success` action bumps
      // `dataUpdateCount`, so an increase is the exact "a push landed" signal.
      // Ungated, a plain refetch or invalidate would (a) coarse-confirm every
      // resolved op, (b) content-confirm an op against a placeholder base (an
      // empty base "reflects" a remove), and (c) charge a divergence MISS for a
      // snapshot that never arrived — filing bogus divergence reports.
      //
      // `dataUpdateCount` is monotonic for a query's lifetime, and `useResource`
      // holds an observer for as long as this hook is mounted, so the cache
      // entry cannot be gc'd and recreated with a reset counter underneath us.
      const gen = event.query.state.dataUpdateCount;
      if (gen <= lastGenRef.current) return;
      lastGenRef.current = gen;
      if (pendingRef.current.length === 0) return;
      const serverData = event.query.state.data as Data | undefined;
      if (serverData === undefined) return;
      const next = confirmPass(pendingRef.current, serverData, confirmationRef.current);
      if (next.diverged.length > 0) reportDiverged(next.diverged);
      // `confirmPass` returns the input BY IDENTITY when nothing changed.
      if (next.pending !== pendingRef.current) commitPending(next.pending);
    });
    // The subscription stays mounted for the resource's lifetime and reads the
    // freshest confirmation off the stable `confirmationRef.current` at call time.
  }, [queryClient, targetKey, commitPending, reportDiverged]);

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
      // The cache generation at dispatch. Coarse confirmation later asks "did a
      // push land after this?" — the fix for consumers with no `isConfirmedBy`.
      const dispatchGen =
        queryClient.getQueryState<Data>(queryKeyRef.current)?.dataUpdateCount ?? 0;
      commitPending([...pendingRef.current, { opId, vars, resolved: false, dispatchGen, misses: 0 }]);
      void mutate(vars).then(
        () => {
          // Confirm against what the cache ALREADY holds: the confirming push
          // routinely lands ~1ms before this response (the change-feed pushes at
          // commit; the response waits on the handler's post-commit tail), and it
          // is the only push this write will ever generate.
          //
          // `state.data` is only a SNAPSHOT once an authoritative value has
          // landed. Before the first push it is `resource.initialData` — a
          // placeholder that `isConfirmedBy` would happily accept (an empty base
          // "reflects" a remove, and vacuously absorbs an update-only patch),
          // dropping the op against data the server never sent. `dataUpdatedAt`
          // is 0 until the first real write (`useResource` derives its own
          // `pending` flag from exactly this), so gate on it.
          const state = queryClient.getQueryState<Data>(queryKeyRef.current);
          const hasAuthoritative = (state?.dataUpdatedAt ?? 0) > 0;
          const next = resolvePass(
            pendingRef.current,
            opId,
            hasAuthoritative ? state?.data : undefined,
            state?.dataUpdateCount ?? 0,
            confirmationRef.current,
          );
          if (next.diverged.length > 0) reportDiverged(next.diverged);
          commitPending(next.pending);
          // Stamp "saved" HERE — a persistent state value the sync-status store
          // observes, rather than an effect on a boolean React may coalesce away.
          if (!next.pending.some((op) => !op.resolved) && failedRef.current.length === 0) {
            setSavedAt(Date.now());
          }
        },
        (err: unknown) => {
          // Reject = rollback: removing the op recomputes the overlay without it
          // (the cache was never mutated, so there is nothing else to undo). The
          // op is then retained in `failed` so the surface can report the error
          // and offer a retry, instead of the failure silently vanishing.
          commitPending(removeOp(pendingRef.current, opId));
          setFailed((prev) => [...prev, { opId, vars }]);
          if (onError) onError(err, vars);
        },
      );
      return opId;
    },
    [queryClient, mutate, onError, commitPending, reportDiverged],
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

  // Re-run only THIS hook's own failed ops. `retryAll` stays stable across
  // renders (it re-derives only when `retry` does, i.e. never), reading the
  // freshest failed list off the stable `failedRef.current` — so the identity
  // handed to useReportSync never churns (the indicator pulls it imperatively).
  const retryAll = useCallback(() => {
    failedRef.current.forEach((f) => retry(f.opId));
  }, [retry]);

  const pendingOps = useMemo(
    () => pending.map((op) => ({ opId: op.opId, vars: op.vars })),
    [pending],
  );

  // "Saving" is UNRESOLVED ops only. `pending` also carries server-acked ops
  // awaiting their confirming push — counting those (the old `inFlight.length`)
  // is what pinned the cloud on "Saving…" forever.
  const saving = useMemo(() => pending.some((op) => !op.resolved), [pending]);

  // Forced sync-status reporting: any optimistic surface lights up the universal
  // indicator with no indicator code of its own. Retry is wired to retryAll so
  // the indicator's Retry button re-runs only this hook's failed ops.
  const phase = failed.length ? "error" : saving ? "syncing" : "idle";
  useReportSync({
    phase,
    label,
    retry: failed.length ? retryAll : undefined,
    savedAt,
  });

  // Stable identity so the result can feed memo deps / combineResources gates.
  return useMemo(
    () => ({
      data,
      serverData: base,
      pending: result.pending,
      dispatch,
      pendingOps,
      saving,
      failed,
      retry,
    }),
    [data, base, result.pending, dispatch, pendingOps, saving, failed, retry],
  );
}
