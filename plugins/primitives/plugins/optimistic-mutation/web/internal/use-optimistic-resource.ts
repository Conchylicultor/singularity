import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useResource,
  queryKeyFor,
  liveStateSocketKind,
  getResourceWatermark,
} from "@plugins/primitives/plugins/live-state/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { subscribeWsStatus } from "@plugins/primitives/plugins/networking/web";
import { EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";
import { optimisticDivergenceReportSink } from "../reporter";
import {
  clearFailure,
  confirmPass,
  markFailed,
  replay,
  resolvePass,
  type OpFailure,
  type PendingOp,
  type ReconcileResult,
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
  /**
   * Network thunk; resolves on server 2xx (the op was accepted). Return
   * `{ watermark }` — the commit's `pg_current_xact_id()::text` read inside the
   * write transaction (Rule A) — to upgrade this op to exact causal
   * confirmation/denial; a plain `Promise<void>` stays tokenless (legacy
   * coarse / content-only confirmation, no denial).
   */
  mutate: (vars: Vars) => Promise<void | { watermark?: string }>;
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
 * Confirmation mode. Coarse (neither field) clears a resolved op once a
 * snapshot causally past its ack token has landed (or, tokenless, once an
 * authoritative push has landed since it was dispatched). Content-based
 * REQUIRES both fields together: `isConfirmedBy(serverData, vars)` asks "has
 * this server snapshot already reflected `vars`?" (precise content check, e.g.
 * "row id X present"), and `sameTarget(a, b)` declares op identity ("do `a` and
 * `b` write the SAME entity/key?").
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
  /**
   * True until the FIRST authoritative value lands. Deliberately NOT the widened
   * `useResource` `pending`: once a value has been seen, a later transient error
   * keeps the surface painting `data`/`serverData` (last-known-good) and reports
   * the failure through `error` + sync-status — it does not revert to loading.
   */
  pending: boolean;
  /**
   * The current transient load error, or null. Optimistic surfaces keep painting
   * last-known-good under it (the sanctioned exemption to live-state's I1); this
   * lets them surface the failure. Null once a fresh authoritative value lands.
   */
  error: Error | null;
  /** Enqueue an overlay op + fire `mutate`; returns the minted opId. */
  dispatch: (vars: Vars) => string;
  /**
   * Every op still in the overlay — including ones the server has already
   * ACKED but whose confirming push hasn't been matched yet, and ones whose
   * `mutate` rejected (a failed edit keeps rendering — never-revert). This is
   * the replay set, NOT the "is anything unsaved" signal: read `saving` for that.
   */
  pendingOps: ReadonlyArray<{ opId: string; vars: Vars }>;
  /** True while at least one op's `mutate` has not come back yet. */
  saving: boolean;
  /**
   * Ops whose `mutate` was durably REJECTED by the server (an HTTP error —
   * `EndpointError`). They are still rendered (still in `pendingOps`) but need
   * an explicit `retry` to converge. Network-level failures (fetch rejected —
   * offline, restarting server) are deliberately NOT here: nothing is known to
   * be wrong with those ops, so they stay `syncing` and auto-retry on the next
   * reconnect edge.
   */
  failed: ReadonlyArray<{ opId: string; vars: Vars }>;
  /**
   * Re-fire a failed op's `mutate` IN PLACE: same opId, same overlay position —
   * the rendered prediction never moves or flickers.
   */
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
  // Optimistic surfaces are the sanctioned, LOUD exemption to live-state's I1
  // ("`pending` means no trustworthy value"): they are editors, so under a
  // transient error they deliberately KEEP PAINTING last-known-good rather than
  // blanking — `sync-status` (wired below via useReportSync) owns their error
  // affordance. So the overlay base falls back to `result.stale` (the last
  // authoritative value) before `resource.initialData`. Without this, the
  // widened `pending` would collapse the base to `initialData` on any transient
  // error and blank the page block editor / conversation queue sidebar.
  const base = result.pending ? (result.stale ?? resource.initialData) : result.data;
  // Preserve the documented `pending` contract — "true until the FIRST
  // authoritative value" — rather than forwarding the widened one: once a value
  // has landed (`stale` defined), an error must NOT re-report the surface as
  // loading. `result.stale === undefined` is exactly the never-loaded case.
  const resultPending = result.pending && result.stale === undefined;
  // The transient error (if any), surfaced so editor surfaces can report it
  // (they keep painting `base`). Only the pending arm carries `error`.
  const resultError = result.pending ? result.error : null;

  const [pending, setPending] = useState<ReadonlyArray<PendingOp<Vars>>>([]);
  // Explicit "everything this hook dispatched has been acked" timestamp,
  // reported to sync-status. Stamped inside the resolve handler, never inferred
  // from a derived boolean (a transient boolean can be coalesced away within one
  // React render — the exact hazard sync-status/CLAUDE.md documents).
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Commit mirror of `pending`. Every lifecycle edge (dispatch / resolve /
  // reject / retry / push) fires from an event or promise callback, decides the
  // next overlay against this ref, and writes both. A functional `setPending`
  // updater cannot be used: the pure machine returns `{ pending, dropped,
  // stalled }`, and extracting the report lists from inside an updater would
  // make the updater effectful (React may invoke it twice). Sequential edges
  // within one tick chain correctly because the ref is written synchronously.
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
  const mutateRef = useLatestRef(mutate);
  const onErrorRef = useLatestRef(onError);

  const queryKey = useMemo(() => queryKeyFor(resource.key, params), [resource.key, params]);
  const queryKeyRef = useLatestRef(queryKey);
  const targetKey = useMemo(() => JSON.stringify(queryKey), [queryKey]);

  // The server-acked ops and the server's snapshots durably disagree — either
  // provably superseded (dropped, healthy) or stalled past the miss threshold
  // (kept, one-shot investigation signal). Not a spinner state (the writes DID
  // succeed) — a loud, deduped report, via the sanctioned sink inversion
  // (`error-boundary` → `reports.crash` is the precedent), because the
  // primitive must not import `reports`. `emit` never throws.
  const reportDivergence = useCallback(
    (kind: "superseded" | "stalled", ops: ReadonlyArray<PendingOp<Vars>>) => {
      const describe = describeOpRef.current;
      optimisticDivergenceReportSink.emit({
        kind,
        resourceKey: resource.key,
        params: paramsRef.current ?? null,
        label: labelRef.current ?? null,
        misses: Math.max(...ops.map((op) => op.misses)),
        opSummaries: describe ? ops.map((op) => describe(op.vars)) : [],
      });
    },
    // The latest-ref handles are stable; only the resource key participates.
    [resource.key],
  );
  const reportOutcomes = useCallback(
    (next: ReconcileResult<Vars>) => {
      if (next.dropped.length > 0) reportDivergence("superseded", next.dropped);
      if (next.stalled.length > 0) reportDivergence("stalled", next.stalled);
    },
    [reportDivergence],
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
      // snapshot that never arrived — filing bogus stalled reports.
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
      // The registry is written immediately BEFORE the setQueryData that fired
      // this event, so this synchronous read is the causal floor of exactly the
      // snapshot we are confirming against (Rule B′).
      const next = confirmPass(
        pendingRef.current,
        serverData,
        getResourceWatermark(resource.key, paramsRef.current),
        confirmationRef.current,
      );
      reportOutcomes(next);
      // `confirmPass` returns the input BY IDENTITY when nothing changed.
      if (next.pending !== pendingRef.current) commitPending(next.pending);
    });
    // The subscription stays mounted for the resource's lifetime and reads the
    // freshest confirmation off the stable `confirmationRef.current` at call time.
  }, [queryClient, targetKey, resource.key, commitPending, reportOutcomes]);

  const data = useMemo(
    // `applyRef` (stable useLatestRef handle) is read through `.current` at
    // compute time; recompute is intentionally keyed on base/pending only — apply
    // identity churn must NOT invalidate the overlay.
    // eslint-disable-next-line react-hooks/refs -- intentional latest-reducer read inside the overlay memo (see above); the read is render-phase by design and the ref is stable
    () => replay(base, pending, applyRef.current),
    [base, pending],
  );

  // Fire (or re-fire) an op's `mutate`. Stable identity: dispatch, retry, and
  // the reconnect auto-retry all share it, reading the freshest mutate/onError
  // off their latest-refs. Returns the outcome so the sequential failed-op
  // drain can stop when the transport is still down.
  const runMutate = useCallback(
    (opId: string, vars: Vars): Promise<"resolved" | OpFailure["kind"]> => {
      return mutateRef.current(vars).then(
        (res) => {
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
            getResourceWatermark(resource.key, paramsRef.current),
            res ? res.watermark : undefined,
            confirmationRef.current,
          );
          reportOutcomes(next);
          commitPending(next.pending);
          // Stamp "saved" HERE — a persistent state value the sync-status store
          // observes, rather than an effect on a boolean React may coalesce away.
          // "Nothing failed" is implied: a failure only ever sits on an
          // UNRESOLVED op (mutate rejected ⇒ never resolved; a retry's resolve
          // clears it), so "no unresolved op remains" covers both.
          if (!next.pending.some((op) => !op.resolved)) {
            setSavedAt(Date.now());
          }
          return "resolved" as const;
        },
        (err: unknown) => {
          // Reject is NOT a rollback: the op keeps rendering (never-revert) and
          // the failure kind drives the sync phase. A durable server rejection
          // (`EndpointError`) surfaces as `error` + manual Retry; anything else
          // is a network-level failure (offline, restarting server) — nothing is
          // known to be wrong with the op, so it stays `syncing` and auto-retries
          // on the next reconnect edge.
          const failure: OpFailure =
            err instanceof EndpointError
              ? { kind: "http", status: err.status }
              : { kind: "network" };
          commitPending(markFailed(pendingRef.current, opId, failure));
          if (onErrorRef.current) onErrorRef.current(err, vars);
          return failure.kind;
        },
      );
    },
    // The latest-ref handles are stable; only these participate.
    [queryClient, resource.key, commitPending, reportOutcomes],
  );

  const dispatch = useCallback(
    (vars: Vars): string => {
      const opId = crypto.randomUUID();
      // The cache generation at dispatch. Tokenless coarse confirmation later
      // asks "did a push land after this?" — for consumers with no
      // `isConfirmedBy` and no ack token.
      const dispatchGen =
        queryClient.getQueryState<Data>(queryKeyRef.current)?.dataUpdateCount ?? 0;
      commitPending([
        ...pendingRef.current,
        { opId, vars, resolved: false, dispatchGen, misses: 0, divergenceReported: false },
      ]);
      void runMutate(opId, vars);
      return opId;
    },
    [queryClient, commitPending, runMutate],
  );

  // Re-fire a failed op IN PLACE: clear its failure and re-run its mutate under
  // the SAME opId — the op never leaves the overlay, so the rendered prediction
  // keeps its position (no remove/re-append flicker, no reorder). Returns the
  // outcome (undefined when the op is gone or not failed) for the drain below.
  const retryOp = useCallback(
    (opId: string): Promise<"resolved" | OpFailure["kind"]> | undefined => {
      const op = pendingRef.current.find((o) => o.opId === opId && o.failure !== undefined);
      if (!op) return undefined;
      commitPending(clearFailure(pendingRef.current, opId));
      return runMutate(opId, op.vars);
    },
    [commitPending, runMutate],
  );
  const retry = useCallback(
    (opId: string) => {
      void retryOp(opId);
    },
    [retryOp],
  );

  // Sequential single-flight drain of failed ops, in overlay order. Ordering is
  // load-bearing: structural ops depend on their predecessors' server-side
  // effects (a second split targets the block the first one created), so a
  // concurrent replay can land out of order and be durably rejected for a row
  // that is merely not committed YET. Await each op before firing the next; a
  // `network` outcome stops the drain (the transport is still down — every
  // later op would fail the same way; the next reconnect edge re-drains), an
  // `http` outcome parks that op for manual Retry and keeps draining (later
  // ops get their in-order shot).
  const drainingRef = useRef(false);
  const drainFailed = useCallback(
    async (kinds: ReadonlyArray<OpFailure["kind"]>) => {
      if (drainingRef.current) return;
      drainingRef.current = true;
      try {
        const opIds = pendingRef.current
          .filter((op) => op.failure !== undefined && kinds.includes(op.failure.kind))
          .map((op) => op.opId);
        for (const opId of opIds) {
          const outcome = await retryOp(opId);
          if (outcome === "network") return;
        }
      } finally {
        drainingRef.current = false;
      }
    },
    [retryOp],
  );

  // Auto-retry NETWORK-failed ops on reconnect edges (mirrors the Yjs
  // provider's offline-is-syncing policy — push-based, no timers, no per-push
  // retry):
  //  - the live-state socket for THIS resource's origin reopening (covers
  //    server restarts, where navigator.onLine never changed; HTTP and the WS
  //    ride the same gateway, so "socket reopened" implies endpoints are
  //    reachable again);
  //  - the browser's `online` event (covers actual connectivity loss, where an
  //    idle WS may not surface a close promptly).
  // HTTP-failed ops are deliberately excluded: the server already gave a
  // durable verdict, so re-firing them on reconnect would just repeat it —
  // they wait for an explicit `retry`.
  const retryNetworkFailed = useCallback(() => {
    void drainFailed(["network"]);
  }, [drainFailed]);
  useEffect(() => {
    const socketKind = resource.origin === "central" ? "central" : "worktree";
    const unsubscribe = subscribeWsStatus((ev) => {
      if (ev.status !== "open" || liveStateSocketKind(ev.url) !== socketKind) return;
      retryNetworkFailed();
    });
    const onOnline = () => retryNetworkFailed();
    window.addEventListener("online", onOnline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [resource.origin, retryNetworkFailed]);

  const pendingOps = useMemo(
    () => pending.map((op) => ({ opId: op.opId, vars: op.vars })),
    [pending],
  );

  // "Saving" is UNRESOLVED ops only. `pending` also carries server-acked ops
  // awaiting their confirming push — counting those (the old `inFlight.length`)
  // is what pinned the cloud on "Saving…" forever.
  const saving = useMemo(() => pending.some((op) => !op.resolved), [pending]);

  // The durably-rejected subset, derived from the overlay (failed ops never
  // left it). Network-failed ops are NOT failed — they are `syncing`.
  const failed = useMemo(
    () =>
      pending
        .filter((op) => op.failure?.kind === "http")
        .map((op) => ({ opId: op.opId, vars: op.vars })),
    [pending],
  );
  // Re-run only THIS hook's own failed ops — the SAME sequential drain as the
  // reconnect edges (order dependence doesn't care why an op failed), widened
  // to both kinds so the cloud's Retry also nudges network-failed ops. Stable
  // identity: the indicator pulls it imperatively.
  const retryAll = useCallback(() => {
    void drainFailed(["http", "network"]);
  }, [drainFailed]);

  // Re-fetch the RESOURCE (not an op) — the retry for a failing READ.
  const refetchRef = useLatestRef(result.refetch);
  const retryLoad = useCallback(() => {
    void refetchRef.current();
  }, [refetchRef]);

  // Forced sync-status reporting: any optimistic surface lights up the universal
  // indicator with no indicator code of its own. Retry is wired to retryAll so
  // the indicator's Retry button re-runs only this hook's failed ops. A
  // network-failed op is unresolved, so it reports as `syncing` (the Yjs lane's
  // offline-is-syncing policy) — only a durable HTTP rejection is an `error`.
  //
  // A failing READ is an `error` too, and this is the ONLY place it can surface.
  // These surfaces are the sanctioned exemption to live-state's I1: they keep
  // painting last-known-good (`base` falls back to `result.stale`) instead of
  // blanking, which is right — but it means a durably-failing load is otherwise
  // INVISIBLE (a never-loaded surface shimmers its skeleton forever; a
  // once-loaded one silently serves stale rows). The exemption is only sound if
  // the failure it swallows comes out here, with a Retry that re-fetches.
  const loadFailed = resultError !== null;
  const phase = failed.length || loadFailed ? "error" : saving ? "syncing" : "idle";
  useReportSync({
    phase,
    label,
    retry: failed.length ? retryAll : loadFailed ? retryLoad : undefined,
    savedAt,
  });

  // Stable identity so the result can feed memo deps / combineResources gates.
  return useMemo(
    () => ({
      data,
      serverData: base,
      pending: resultPending,
      error: resultError,
      dispatch,
      pendingOps,
      saving,
      failed,
      retry,
    }),
    [data, base, resultPending, resultError, dispatch, pendingOps, saving, failed, retry],
  );
}
