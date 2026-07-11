// Pure overlay/replay logic for optimistic mutation. Lives apart from React so
// it can be unit-tested directly without a render. The hook
// (`use-optimistic-resource.ts`) is a thin React shell over these functions:
// the whole op lifecycle (dispatch → resolve/fail → confirm → deny/stall) is
// decided here, so the shell only owns state plumbing and the report emits.
//
// The governing policy (research/2026-07-11-global-never-revert-optimistic-edits.md):
// **pending local edits are never visually reverted.** An op leaves the overlay
// only for a CAUSAL reason — provably absorbed (confirmation, cascade) or
// provably superseded (a causally-later snapshot lacks its effect, Rule B).
// Failure is a sync-status state, not an undo; divergence without causal proof
// is a report, not an eviction.

import { compareTxWatermark } from "@plugins/primitives/plugins/live-state/core";

/**
 * The one error an `apply` reducer may throw to say "this op no longer applies
 * to the current base" — e.g. the server already absorbed it and the row it
 * referenced is gone, or the base moved out from under a moved-relative op.
 * `replay` catches ONLY this and drops the op; any other throw is a bug in the
 * reducer and propagates loudly (fail loudly — never silence). Consumers import
 * this from the primitive's barrel and throw it from `apply` for the stale case
 * instead of throwing a bare `Error`.
 */
export class OpNoLongerApplies extends Error {
  constructor(message = "optimistic op no longer applies to the current base") {
    super(message);
    this.name = "OpNoLongerApplies";
  }
}

/**
 * How many consecutive authoritative pushes may land, after an op resolved,
 * without confirming it before the primitive files a ONE-TIME `stalled` report.
 *
 * This is a report trigger, NEVER an eviction: under push lag those "misses"
 * can be stale snapshots computed before the op's commit (delivery order is not
 * causality), so dropping the op here would revert the user's edit — the exact
 * bug the never-revert rewrite removed. The op stays in the overlay, keeps
 * replaying, and remains confirmable by any later snapshot; the report
 * preserves observability for a genuinely wrong `apply`/`isConfirmedBy` pair.
 */
export const DIVERGENCE_REPORT_MISSES = 3;

/**
 * Why an op's `mutate` rejected. `network` = the request never got an HTTP
 * verdict (fetch rejected — offline, server restarting): nothing is known to be
 * wrong with the op, so it keeps rendering as `syncing` and auto-retries on
 * reconnect edges. `http` = the server durably rejected it (`EndpointError`):
 * it keeps rendering, surfaces as `error`, and waits for an explicit retry.
 */
export type OpFailure = { kind: "network" } | { kind: "http"; status: number };

/** One pending optimistic op. `vars` is replayed via `apply` on top of base. */
export interface PendingOp<Vars> {
  opId: string;
  vars: Vars;
  /** Set once the network `mutate(vars)` promise resolves (server accepted). */
  resolved: boolean;
  /**
   * Cache generation (`dataUpdateCount`) observed at dispatch. Tokenless coarse
   * confirmation compares against it: a strictly greater generation proves an
   * authoritative push landed *after* this op was dispatched.
   */
  dispatchGen: number;
  /**
   * Consecutive authoritative pushes since resolve that did NOT confirm this
   * op. A REPORT trigger only (see `DIVERGENCE_REPORT_MISSES`) — never evicts.
   */
  misses: number;
  /**
   * The commit's ack token (`pg_current_xact_id()::text`, Rule A), when the
   * consumer's `mutate` returned one. Stamped at the resolve edge. Enables
   * exact causal confirmation (coarse) and causal denial (content mode): a
   * snapshot whose watermark is strictly greater provably saw this commit.
   */
  ackWatermark?: string;
  /** Present while the op's latest `mutate` attempt rejected (see `OpFailure`). */
  failure?: OpFailure;
  /**
   * One-shot latch: the `stalled` report for this op has been filed. Misses may
   * keep accruing, but the op is never reported twice.
   */
  divergenceReported: boolean;
}

/**
 * The outcome of one lifecycle edge (a push, or a resolve). `pending` is the
 * surviving overlay — returned by IDENTITY when nothing changed, so the React
 * shell can bail out of a state write without comparing arrays.
 *
 * - `dropped` — ops causally DENIED: a snapshot watermark strictly after their
 *   commit still lacks their effect, so they were superseded by newer server
 *   truth and removed from the overlay (rendering newer truth, not a revert).
 *   The caller reports them with `kind: "superseded"`.
 * - `stalled` — ops that just crossed `DIVERGENCE_REPORT_MISSES` for the first
 *   time. They are STILL IN `pending` (never evicted); the caller reports them
 *   once with `kind: "stalled"`.
 */
export interface ReconcileResult<Vars> {
  pending: ReadonlyArray<PendingOp<Vars>>;
  dropped: ReadonlyArray<PendingOp<Vars>>;
  stalled: ReadonlyArray<PendingOp<Vars>>;
}

/**
 * Replay every pending op over `base` in insertion order. An op whose `apply`
 * throws `OpNoLongerApplies` is DROPPED from the fold (the base moved past it) —
 * this keeps replay total: a stale op can never crash the overlay or wipe out
 * the other pending ops. Any OTHER throw is a reducer bug and propagates.
 */
export function replay<Data, Vars>(
  base: Data,
  pending: ReadonlyArray<PendingOp<Vars>>,
  apply: (current: Data, vars: Vars) => Data,
): Data {
  let acc = base;
  for (const op of pending) {
    acc = safeApply(acc, op.vars, apply);
  }
  return acc;
}

/**
 * Apply one op. If `apply` throws `OpNoLongerApplies`, return the prior
 * accumulator unchanged (the op is silently dropped from the fold). Every other
 * error is re-thrown so genuine reducer bugs surface loudly rather than being
 * masked by the next authoritative push.
 */
function safeApply<Data, Vars>(
  acc: Data,
  vars: Vars,
  apply: (current: Data, vars: Vars) => Data,
): Data {
  try {
    return apply(acc, vars);
  } catch (err) {
    if (err instanceof OpNoLongerApplies) return acc;
    throw err;
  }
}

/**
 * Confirmation mode. Coarse (no `Confirmation`) means "prove a snapshot at or
 * after my commit landed" — exactly via the ack token when the consumer's
 * `mutate` returned one, or legacy "an authoritative push landed after
 * dispatch" when tokenless. Content-based asks the snapshot directly via
 * `isConfirmedBy`, and declares op identity via `sameTarget` for the
 * same-target cascade (see `reconcile`).
 */
export interface Confirmation<Data, Vars> {
  isConfirmedBy: (serverData: Data, vars: Vars) => boolean;
  sameTarget: (a: Vars, b: Vars) => boolean;
}

/**
 * Is op `i` superseded by a NEWER confirmed op writing the same target?
 *
 * **Cascade confirmation** (content-based mode): when an op is confirmed, every
 * RESOLVED op *older* than it (earlier in the pending order) **on the same
 * target** is absorbed too, even if the snapshot doesn't match it. Same-target
 * ops resolve in dispatch order in practice, so a snapshot reflecting a newer
 * write to a target already CONTAINS the older resolved write's effect on that
 * target — possibly overwritten by the newer one. If such an op still doesn't
 * match the snapshot, it can never match any future snapshot either; keeping it
 * would replay stale state forever. The concrete failure this closes: undo
 * dispatches patch P (e.g. "delete row X"), redo dispatches its inverse P⁻¹
 * ("restore X") before a push carrying P's state arrives — the eventual push
 * shows X present, confirming P⁻¹ but never P, and the stuck P would keep
 * deleting X from every rendered state from then on.
 *
 * The containment argument above is only valid WITHIN one entity/key: an older
 * resolved op on an UNRELATED target (whose own confirming push simply hasn't
 * arrived yet) must never be cascade-dropped — that would transiently revert
 * its surface to stale server data. `sameTarget(a, b)` is the consumer's
 * declaration of op identity ("do these two ops write the same entity?"). It is
 * required alongside `isConfirmedBy`, so content-based mode always cascades.
 */
function supersededBy<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  confirmed: ReadonlyArray<boolean>,
  sameTarget: (a: Vars, b: Vars) => boolean,
  i: number,
): boolean {
  for (let j = i + 1; j < pending.length; j++) {
    if (confirmed[j] && sameTarget(pending[i]!.vars, pending[j]!.vars)) return true;
  }
  return false;
}

/**
 * The one place an op leaves the overlay. Given a per-index `confirmed`
 * verdict, drop every RESOLVED op that is confirmed or cascade-superseded, keep
 * every UNRESOLVED op untouched (failed ops are unresolved by construction —
 * their `mutate` rejected — so confirmation, cascade, denial, and miss counting
 * are all structurally unable to touch them: they keep replaying, which IS the
 * never-revert policy), and decide the fate of the resolved-but-unconfirmed
 * survivors:
 *
 * - **Causal denial** (`denyWatermark` set — the push edge in content mode
 *   only): an op carrying an `ackWatermark` with
 *   `compareTxWatermark(denyWatermark, ackWatermark) > 0` is provably
 *   superseded — the snapshot saw its commit (Rule B, strict `>`) yet
 *   `isConfirmedBy` still rejects it, so a newer server write overwrote its
 *   effect. It is removed into `dropped` (rendering newer truth, not a revert).
 *   Tokenless ops are NEVER denied — without a token there is no causal proof.
 * - `countMisses` (the push edge): a fresh authoritative snapshot arrived and
 *   still doesn't reflect the op ⇒ `misses + 1`. Crossing
 *   `DIVERGENCE_REPORT_MISSES` for the first time returns the op in `stalled`
 *   (a one-shot report latch, `divergenceReported`) — the op itself is KEPT.
 * - `!countMisses` (the resolve edge): no new snapshot arrived, so a
 *   non-confirmation carries no information — the op survives unchanged.
 *
 * A cascade-dropped op is NEVER denied or reported: being superseded by a newer
 * write to the same target is the expected, healthy outcome.
 *
 * Returns `pending` BY IDENTITY when nothing changed, so the React shell can
 * skip the state write (and the overlay recompute it would trigger).
 */
function reconcile<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  confirmed: ReadonlyArray<boolean>,
  sameTarget: ((a: Vars, b: Vars) => boolean) | undefined,
  countMisses: boolean,
  denyWatermark: string | undefined,
): ReconcileResult<Vars> {
  const kept: PendingOp<Vars>[] = [];
  const dropped: PendingOp<Vars>[] = [];
  const stalled: PendingOp<Vars>[] = [];
  let changed = false;

  for (let i = 0; i < pending.length; i++) {
    const op = pending[i]!;
    if (!op.resolved) {
      kept.push(op);
      continue;
    }
    if (confirmed[i]) {
      changed = true; // the server absorbed it
      continue;
    }
    if (sameTarget && supersededBy(pending, confirmed, sameTarget, i)) {
      changed = true; // superseded by a newer confirmed write to the same target
      continue;
    }
    if (
      denyWatermark !== undefined &&
      op.ackWatermark !== undefined &&
      compareTxWatermark(denyWatermark, op.ackWatermark) > 0
    ) {
      // Rule B, strict `>`: the snapshot provably saw this op's commit and
      // still doesn't reflect it — genuinely superseded by newer server truth.
      changed = true;
      dropped.push(op);
      continue;
    }
    if (!countMisses) {
      kept.push(op);
      continue;
    }
    changed = true;
    const misses = op.misses + 1;
    if (misses >= DIVERGENCE_REPORT_MISSES && !op.divergenceReported) {
      const reported = { ...op, misses, divergenceReported: true };
      stalled.push(reported);
      kept.push(reported);
    } else {
      kept.push({ ...op, misses });
    }
  }

  return changed ? { pending: kept, dropped, stalled } : { pending, dropped, stalled };
}

/**
 * The PUSH edge: an authoritative snapshot landed in the cache.
 * `snapshotWatermark` is the newest commit watermark seen for this
 * `(key, params)` (the client watermark registry — Rule B′), or `undefined`
 * when no watermark-carrying frame has arrived (fresh sub, central origin,
 * scoped-delta-only traffic). Undefined means "no causal floor": confirmation
 * by content or legacy-coarse still works, but nothing can be causally
 * confirmed or denied.
 *
 *   - coarse + token: confirm iff `cmp(snapshotWatermark, ackWatermark) > 0` —
 *     the snapshot provably saw the commit (exact causal coarse confirmation).
 *   - coarse tokenless (legacy): any resolved op is dropped — "a push after my
 *     mutation resolved confirms me".
 *   - content-based: a resolved op is dropped when `isConfirmedBy(serverData,
 *     vars)` accepts the snapshot, when a newer confirmed op on the same target
 *     supersedes it (the cascade), or — denial — when it carries a token the
 *     snapshot is causally past yet still unreflected (see `reconcile`).
 *
 * Un-resolved ops (mutate still in flight, or failed) are always kept.
 * Insertion order is preserved for the survivors. Resolved survivors accrue a
 * miss; crossing `DIVERGENCE_REPORT_MISSES` files a one-shot `stalled` report —
 * the op itself is never evicted.
 */
export function confirmPass<Data, Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  serverData: Data,
  snapshotWatermark: string | undefined,
  confirmation?: Confirmation<Data, Vars>,
): ReconcileResult<Vars> {
  if (!confirmation) {
    const confirmed = pending.map((op) => {
      if (!op.resolved) return false;
      if (op.ackWatermark !== undefined) {
        return (
          snapshotWatermark !== undefined &&
          compareTxWatermark(snapshotWatermark, op.ackWatermark) > 0
        );
      }
      return true; // legacy tokenless coarse: any post-resolve push confirms
    });
    return reconcile(pending, confirmed, undefined, true, undefined);
  }
  const { isConfirmedBy, sameTarget } = confirmation;
  const confirmed = pending.map((op) => op.resolved && isConfirmedBy(serverData, op.vars));
  // Denial is content-mode-only: coarse has no isConfirmedBy to say "the
  // snapshot lacks my effect", so a causally-later snapshot simply confirms.
  return reconcile(pending, confirmed, sameTarget, true, snapshotWatermark);
}

/**
 * The RESOLVE edge: `mutate(vars)` came back 2xx for `opId`. Mark it resolved,
 * stamp the endpoint's `ackWatermark` (when returned — Rule A), clear any prior
 * `failure` (a retried op just succeeded), then attempt confirmation
 * IMMEDIATELY against what the cache already holds — without this, an op whose
 * confirming push arrived *before* its own HTTP response (the structurally-
 * biased ordering: the DB change-feed pushes at commit, while the response
 * waits on the handler's post-commit tail) would sit resolved-and-unconfirmed
 * indefinitely, because the only confirming push it will ever get has already
 * been consumed.
 *
 * - content-based: confirm iff a snapshot exists and `isConfirmedBy` accepts
 *   it, then run the same same-target cascade.
 * - coarse + token: confirm iff `cmp(snapshotWatermark, ackWatermark) > 0` —
 *   the cached snapshot provably saw this commit.
 * - coarse tokenless: confirm iff `gen > op.dispatchGen` — an authoritative
 *   push landed since dispatch.
 *
 * **Tokenless-coarse soundness, stated explicitly.** `gen > dispatchGen` proves
 * *a* push arrived after dispatch, not that it carries our commit. In the rare
 * bad ordering (a push generated pre-commit, delivered post-dispatch) the op
 * drops early and the UI briefly reverts until the real push lands — which is
 * *guaranteed* to arrive, since the write committed. Bounded and self-healing;
 * never a permanent zombie. Returning the token from `mutate` upgrades a coarse
 * consumer to the exact causal check.
 *
 * No miss is counted and no denial runs on this edge: no new snapshot arrived,
 * so a non-confirmation carries no evidence.
 *
 * `serverData` must be an AUTHORITATIVE snapshot, or `undefined` when none has
 * landed yet. A resource's `initialData` is a placeholder, never a snapshot, and
 * must not be passed: an empty base "reflects" a remove and vacuously absorbs an
 * update-only patch, so `isConfirmedBy` would confirm the op against data the
 * server never sent.
 */
export function resolvePass<Data, Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  opId: string,
  serverData: Data | undefined,
  gen: number,
  snapshotWatermark: string | undefined,
  ackWatermark: string | undefined,
  confirmation?: Confirmation<Data, Vars>,
): ReconcileResult<Vars> {
  const resolved = markResolved(pending, opId, ackWatermark);
  const confirmed = resolved.map((op) => {
    if (op.opId !== opId) return false;
    if (confirmation) {
      return serverData !== undefined && confirmation.isConfirmedBy(serverData, op.vars);
    }
    if (op.ackWatermark !== undefined) {
      return (
        snapshotWatermark !== undefined &&
        compareTxWatermark(snapshotWatermark, op.ackWatermark) > 0
      );
    }
    return gen > op.dispatchGen;
  });
  return reconcile(resolved, confirmed, confirmation?.sameTarget, false, undefined);
}

/**
 * Mark the op with `opId` resolved, stamping its ack token (when the endpoint
 * returned one) and clearing any prior failure — a retried op that just
 * succeeded is no longer failed. Preserves array order. No-op if absent.
 */
export function markResolved<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  opId: string,
  ackWatermark?: string,
): PendingOp<Vars>[] {
  return pending.map((op) => {
    if (op.opId !== opId) return op;
    const { failure: _failure, ...rest } = op;
    return { ...rest, resolved: true, ...(ackWatermark !== undefined ? { ackWatermark } : {}) };
  });
}

/**
 * Record that the op's `mutate` rejected. The op STAYS in the overlay (the
 * edit keeps rendering — never-revert); the failure kind drives the surface's
 * sync phase (`network` ⇒ syncing + auto-retry, `http` ⇒ error + manual retry).
 * No-op if absent.
 */
export function markFailed<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  opId: string,
  failure: OpFailure,
): PendingOp<Vars>[] {
  return pending.map((op) => (op.opId === opId ? { ...op, failure } : op));
}

/** Clear the op's failure ahead of a retry re-fire. No-op if absent. */
export function clearFailure<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  opId: string,
): PendingOp<Vars>[] {
  return pending.map((op) => {
    if (op.opId !== opId || op.failure === undefined) return op;
    const { failure: _failure, ...rest } = op;
    return rest;
  });
}
