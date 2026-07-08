// Pure overlay/replay logic for optimistic mutation. Lives apart from React so
// it can be unit-tested directly without a render. The hook
// (`use-optimistic-resource.ts`) is a thin React shell over these functions.

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

/** One pending optimistic op. `vars` is replayed via `apply` on top of base. */
export interface PendingOp<Vars> {
  opId: string;
  vars: Vars;
  /** Set once the network `mutate(vars)` promise resolves (server accepted). */
  resolved: boolean;
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
 * Confirmation pass run on each authoritative push. Drops every RESOLVED op the
 * server is judged to have absorbed:
 *   - default (coarse): any resolved op is dropped — "a push after my mutation
 *     resolved confirms me".
 *   - content-based: only drop a resolved op when `isConfirmedBy(serverData,
 *     vars)` returns true.
 * Un-resolved ops (mutate still in flight) are always kept. Insertion order is
 * preserved for the survivors.
 *
 * **Cascade confirmation** (content-based mode): when an op is confirmed, every
 * RESOLVED op *older* than it (earlier in the pending order) **on the same
 * target** is dropped too, even if the snapshot doesn't match it. Same-target
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
export interface Confirmation<Data, Vars> {
  isConfirmedBy: (serverData: Data, vars: Vars) => boolean;
  sameTarget: (a: Vars, b: Vars) => boolean;
}

export function confirmPass<Data, Vars>(
  pending: ReadonlyArray<PendingOp<Vars>>,
  serverData: Data,
  confirmation?: Confirmation<Data, Vars>,
): PendingOp<Vars>[] {
  if (!confirmation) {
    // Coarse: resolved + a push landed ⇒ confirmed ⇒ drop.
    return pending.filter((op) => !op.resolved);
  }
  const { isConfirmedBy, sameTarget } = confirmation;
  const confirmed = pending.map((op) => op.resolved && isConfirmedBy(serverData, op.vars));
  return pending.filter((op, i) => {
    if (!op.resolved) return true;
    if (confirmed[i]) return false;
    // Cascade within the target group: a NEWER confirmed write to the same
    // entity supersedes this op (the snapshot already contains its effect).
    for (let j = i + 1; j < pending.length; j++) {
      if (confirmed[j] && sameTarget(op.vars, pending[j]!.vars)) return false;
    }
    return true;
  });
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
