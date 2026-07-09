// Pure overlay/replay logic for optimistic mutation. Lives apart from React so
// it can be unit-tested directly without a render. The hook
// (`use-optimistic-resource.ts`) is a thin React shell over these functions:
// the whole op lifecycle (dispatch → resolve → confirm → diverge) is decided
// here, so the shell only owns state plumbing and the report emit.

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
 * without confirming it before we declare the server durably disagrees.
 *
 * Safe at 3 because every write to the resource's key generates a push for that
 * key: our own commit is long visible by the third post-resolve push. Reaching
 * the limit means the server accepted the mutation (2xx) yet its snapshots keep
 * not reflecting it — a real divergence, reported rather than replayed forever.
 */
export const DIVERGENCE_MISS_LIMIT = 3;

/** One pending optimistic op. `vars` is replayed via `apply` on top of base. */
export interface PendingOp<Vars> {
  opId: string;
  vars: Vars;
  /** Set once the network `mutate(vars)` promise resolves (server accepted). */
  resolved: boolean;
  /**
   * Cache generation (`dataUpdateCount`) observed at dispatch. Coarse
   * confirmation compares against it: a strictly greater generation proves an
   * authoritative push landed *after* this op was dispatched.
   */
  dispatchGen: number;
  /** Consecutive authoritative pushes since resolve that did NOT confirm this op. */
  misses: number;
}

/**
 * The outcome of one lifecycle edge (a push, or a resolve). `pending` is the
 * surviving overlay — returned by IDENTITY when nothing changed, so the React
 * shell can bail out of a state write without comparing arrays. `diverged` holds
 * the ops the server durably disagrees with: they are already removed from
 * `pending` and are the caller's to report.
 */
export interface ReconcileResult<Vars> {
  pending: ReadonlyArray<PendingOp<Vars>>;
  diverged: ReadonlyArray<PendingOp<Vars>>;
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
 * Confirmation mode. Coarse (no `Confirmation`) means "an authoritative push
 * landed after this op was dispatched, and the op resolved ⇒ confirmed".
 * Content-based asks the snapshot directly via `isConfirmedBy`, and declares op
 * identity via `sameTarget` for the same-target cascade (see `dropConfirmed`).
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
 * The one place an op leaves the overlay. Given a per-index `confirmed` verdict,
 * drop every RESOLVED op that is confirmed or cascade-superseded, keep every
 * UNRESOLVED op untouched, and decide the fate of the resolved-but-unconfirmed
 * survivors:
 *
 * - `countMisses` (the push edge): a fresh authoritative snapshot arrived and
 *   still doesn't reflect the op ⇒ `misses + 1`. Reaching `DIVERGENCE_MISS_LIMIT`
 *   removes it from the overlay and returns it in `diverged`.
 * - `!countMisses` (the resolve edge): no new snapshot arrived, so a
 *   non-confirmation carries no information — the op survives unchanged.
 *
 * A cascade-dropped op is NEVER reported as diverged: being superseded by a
 * newer write to the same target is the expected, healthy outcome.
 *
 * Returns `pending` BY IDENTITY when nothing changed, so the React shell can
 * skip the state write (and the overlay recompute it would trigger).
 */
function dropConfirmed<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  confirmed: ReadonlyArray<boolean>,
  sameTarget: ((a: Vars, b: Vars) => boolean) | undefined,
  countMisses: boolean,
): ReconcileResult<Vars> {
  const kept: PendingOp<Vars>[] = [];
  const diverged: PendingOp<Vars>[] = [];
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
    if (!countMisses) {
      kept.push(op);
      continue;
    }
    changed = true;
    const misses = op.misses + 1;
    if (misses >= DIVERGENCE_MISS_LIMIT) diverged.push({ ...op, misses });
    else kept.push({ ...op, misses });
  }

  return changed ? { pending: kept, diverged } : { pending, diverged };
}

/**
 * The PUSH edge: an authoritative snapshot landed in the cache.
 *
 *   - default (coarse): any resolved op is dropped — "a push after my mutation
 *     resolved confirms me".
 *   - content-based: a resolved op is dropped when `isConfirmedBy(serverData,
 *     vars)` accepts the snapshot, or when a newer confirmed op on the same
 *     target supersedes it (the cascade, see `supersededBy`).
 *
 * Un-resolved ops (mutate still in flight) are always kept. Insertion order is
 * preserved for the survivors. Resolved survivors accrue a miss; at
 * `DIVERGENCE_MISS_LIMIT` they leave the overlay as `diverged`.
 */
export function confirmPass<Data, Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  serverData: Data,
  confirmation?: Confirmation<Data, Vars>,
): ReconcileResult<Vars> {
  if (!confirmation) {
    return dropConfirmed(pending, pending.map((op) => op.resolved), undefined, true);
  }
  const { isConfirmedBy, sameTarget } = confirmation;
  const confirmed = pending.map((op) => op.resolved && isConfirmedBy(serverData, op.vars));
  return dropConfirmed(pending, confirmed, sameTarget, true);
}

/**
 * The RESOLVE edge: `mutate(vars)` came back 2xx for `opId`. Mark it resolved,
 * then attempt confirmation IMMEDIATELY against what the cache already holds —
 * without this, an op whose confirming push arrived *before* its own HTTP
 * response (the structurally-biased ordering: the DB change-feed pushes at
 * commit, while the response waits on the handler's post-commit tail) would sit
 * resolved-and-unconfirmed forever, because the only confirming push it will
 * ever get has already been consumed.
 *
 * - content-based: confirm iff a snapshot exists and `isConfirmedBy` accepts it,
 *   then run the same same-target cascade.
 * - coarse: confirm iff `gen > op.dispatchGen` — an authoritative push landed
 *   since dispatch.
 *
 * **Coarse soundness, stated explicitly.** `gen > dispatchGen` proves *a* push
 * arrived after dispatch, not that it carries our commit. In the rare bad
 * ordering (a push generated pre-commit, delivered post-dispatch) the op drops
 * early and the UI briefly reverts until the real push lands — which is
 * *guaranteed* to arrive, since the write committed. Bounded and self-healing;
 * never a permanent zombie.
 *
 * No miss is counted here: no new snapshot arrived, so a non-confirmation
 * carries no evidence of divergence.
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
  confirmation?: Confirmation<Data, Vars>,
): ReconcileResult<Vars> {
  const resolved = markResolved(pending, opId);
  const confirmed = resolved.map((op) => {
    if (op.opId !== opId) return false;
    if (!confirmation) return gen > op.dispatchGen;
    return serverData !== undefined && confirmation.isConfirmedBy(serverData, op.vars);
  });
  return dropConfirmed(resolved, confirmed, confirmation?.sameTarget, false);
}

/** Mark the op with `opId` resolved, preserving array order. No-op if absent. */
export function markResolved<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  opId: string,
): PendingOp<Vars>[] {
  return pending.map((op) => (op.opId === opId ? { ...op, resolved: true } : op));
}

/** Remove the op with `opId` (the rollback path for a rejected mutate). */
export function removeOp<Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  opId: string,
): PendingOp<Vars>[] {
  return pending.filter((op) => op.opId !== opId);
}
