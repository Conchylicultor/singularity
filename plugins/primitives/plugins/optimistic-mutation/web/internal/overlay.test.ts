/**
 * Tests for the pure overlay/replay logic of the optimistic-mutation primitive.
 * Run with `bun test plugins/primitives/plugins/optimistic-mutation/web/internal`.
 *
 * The hook (`use-optimistic-resource.ts`) is a thin React shell over these
 * functions; the WHOLE op lifecycle (dispatch → resolve/fail → confirm →
 * deny/stall) lives here, so testing them directly exercises the load-bearing
 * invariants (ordered replay, base rebase, both confirmation edges, the
 * same-target cascade, causal denial under the watermark rules, the
 * stalled-report-only miss latch, failed-op immunity, throwing-apply drop)
 * without a render.
 */

import { test, expect, describe } from "bun:test";
import {
  ackPass,
  clearFailure,
  confirmPass,
  DIVERGENCE_REPORT_MISSES,
  markFailed,
  markResolved,
  OpNoLongerApplies,
  replay,
  resolvePass,
  type OpFailure,
  type PendingOp,
} from "./overlay";

// A toy domain: an ordered list of numbers; ops push or remove a number.
type Vars = { kind: "push"; n: number } | { kind: "remove"; n: number };

function applyNums(current: number[], vars: Vars): number[] {
  if (vars.kind === "push") return [...current, vars.n];
  return current.filter((x) => x !== vars.n);
}

function op(
  opId: string,
  vars: Vars,
  resolved = false,
  extra: {
    dispatchGen?: number;
    misses?: number;
    ackWatermark?: string;
    failure?: OpFailure;
    divergenceReported?: boolean;
  } = {},
): PendingOp<Vars> {
  return {
    opId,
    vars,
    resolved,
    dispatchGen: extra.dispatchGen ?? 0,
    misses: extra.misses ?? 0,
    divergenceReported: extra.divergenceReported ?? false,
    ...(extra.ackWatermark !== undefined ? { ackWatermark: extra.ackWatermark } : {}),
    ...(extra.failure !== undefined ? { failure: extra.failure } : {}),
  };
}

/** Content-based confirmation for the toy domain: "is `n` present as expected?" */
const isConfirmedBy = (serverData: number[], vars: Vars): boolean =>
  vars.kind === "push" ? serverData.includes(vars.n) : !serverData.includes(vars.n);
/** Ops on the same number write the same "entity". */
const sameN = (a: Vars, b: Vars): boolean => a.n === b.n;
const content = { isConfirmedBy, sameTarget: sameN };

const ids = (ops: ReadonlyArray<PendingOp<Vars>>): string[] => ops.map((o) => o.opId);

describe("replay", () => {
  test("(1) multiple in-flight ops compose in insertion order", () => {
    const base = [1];
    const pending = [
      op("a", { kind: "push", n: 2 }),
      op("b", { kind: "push", n: 3 }),
      op("c", { kind: "remove", n: 1 }),
    ];
    expect(replay(base, pending, applyNums)).toEqual([2, 3]);
  });

  test("order matters: a remove before its push is a no-op, after it removes", () => {
    const base: number[] = [];
    // remove(9) first (nothing to remove), then push(9) ⇒ [9]
    expect(
      replay(base, [op("a", { kind: "remove", n: 9 }), op("b", { kind: "push", n: 9 })], applyNums),
    ).toEqual([9]);
    // push(9) first, then remove(9) ⇒ []
    expect(
      replay(base, [op("a", { kind: "push", n: 9 }), op("b", { kind: "remove", n: 9 })], applyNums),
    ).toEqual([]);
  });

  test("(2) an interleaved authoritative base change replays remaining pending ops on the new base", () => {
    // Two ops pending. The server pushes a new base (someone else added 7).
    // The still-pending ops must replay on that fresh base, not the old one.
    const pending = [
      op("a", { kind: "push", n: 2 }),
      op("b", { kind: "push", n: 3 }),
    ];
    const oldBase = [1];
    expect(replay(oldBase, pending, applyNums)).toEqual([1, 2, 3]);

    const newBase = [1, 7]; // authoritative push interleaved
    expect(replay(newBase, pending, applyNums)).toEqual([1, 7, 2, 3]);
  });

  test("(5) an op that throws OpNoLongerApplies is dropped, keeps the rest", () => {
    const base = [1];
    const staleApply = (current: number[], vars: Vars): number[] => {
      if (vars.kind === "push" && vars.n === 999) {
        throw new OpNoLongerApplies();
      }
      return applyNums(current, vars);
    };
    const pending = [
      op("a", { kind: "push", n: 2 }),
      op("b", { kind: "push", n: 999 }), // stale ⇒ dropped from the fold
      op("c", { kind: "push", n: 3 }),
    ];
    // 999 is dropped; 2 and 3 still applied in order on the un-mutated acc.
    expect(replay(base, pending, staleApply)).toEqual([1, 2, 3]);
  });

  test("(5b) any OTHER throw is a reducer bug and propagates (fail loudly)", () => {
    const base = [1];
    const buggyApply = (current: number[], vars: Vars): number[] => {
      if (vars.kind === "push" && vars.n === 999) throw new Error("boom");
      return applyNums(current, vars);
    };
    const pending = [
      op("a", { kind: "push", n: 2 }),
      op("b", { kind: "push", n: 999 }), // generic Error ⇒ must NOT be swallowed
    ];
    expect(() => replay(base, pending, buggyApply)).toThrow("boom");
  });
});

describe("failure (markFailed / clearFailure) — never a rollback", () => {
  test("a rejected op STAYS in the overlay and keeps replaying (never-revert)", () => {
    const base = [1];
    const pending = [
      op("a", { kind: "push", n: 2 }),
      op("b", { kind: "push", n: 99 }), // this one will reject
      op("c", { kind: "push", n: 3 }),
    ];
    const afterReject = markFailed(pending, "b", { kind: "http", status: 422 });
    expect(ids(afterReject)).toEqual(["a", "b", "c"]);
    expect(afterReject[1]!.failure).toEqual({ kind: "http", status: 422 });
    // The failed op's prediction is still rendered — failure is a sync-status
    // state (cloud icon), not an undo.
    expect(replay(base, afterReject, applyNums)).toEqual([1, 2, 99, 3]);
  });

  test("clearFailure removes only the failure, keeping the op in place", () => {
    const pending = markFailed(
      [op("a", { kind: "push", n: 2 }), op("b", { kind: "push", n: 3 })],
      "a",
      { kind: "network" },
    );
    const cleared = clearFailure(pending, "a");
    expect(ids(cleared)).toEqual(["a", "b"]);
    expect(cleared[0]!.failure).toBeUndefined();
    expect(cleared[0]!.resolved).toBe(false); // still awaiting its (re-fired) mutate
  });

  test("markFailed / clearFailure are no-ops for an absent opId", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    expect(markFailed(pending, "missing", { kind: "network" })).toEqual(pending);
    expect(clearFailure(pending, "missing")).toEqual(pending);
  });

  test("failed ops are immune to confirm / cascade / denial / miss counting", () => {
    // A failed op is UNRESOLVED (its mutate rejected), so no snapshot may touch
    // it: not confirmable (even when the snapshot happens to match its content),
    // never cascade-dropped, never causally denied (even with a token the
    // snapshot is past), never miss-counted. It keeps replaying — that IS the
    // never-revert policy.
    const failedOp = op("failed", { kind: "push", n: 9 }, false, {
      failure: { kind: "network" },
      ackWatermark: "100", // stale token from a PRIOR attempt — must not enable denial
    });
    const confirmedSibling = op("sibling", { kind: "push", n: 9 }, true); // same target, confirmed
    const next = confirmPass([failedOp, confirmedSibling], [1, 9], "500", content);
    expect(ids(next.pending)).toEqual(["failed"]);
    expect(next.pending[0]!.misses).toBe(0);
    expect(next.dropped).toEqual([]);
    expect(next.stalled).toEqual([]);
  });
});

describe("confirmPass (coarse)", () => {
  test("(4) tokenless coarse clears a resolved op after a push, keeps in-flight ops", () => {
    const pending = [
      op("a", { kind: "push", n: 2 }, true), // resolved ⇒ a push confirms it
      op("b", { kind: "push", n: 3 }, false), // still in flight ⇒ kept
    ];
    const serverData = [1, 2]; // server now reflects op a
    const next = confirmPass(pending, serverData, undefined);
    expect(ids(next.pending)).toEqual(["b"]);
    expect(next.dropped).toEqual([]);
    expect(next.stalled).toEqual([]);
  });

  test("unresolved ops are never dropped, even on a push", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false)];
    const next = confirmPass(pending, [1, 2], undefined);
    expect(ids(next.pending)).toEqual(["a"]);
    // Nothing changed ⇒ the SAME array reference comes back (the shell's bail-out).
    expect(next.pending).toBe(pending);
  });

  test("tokenless coarse never accrues misses (every resolved op is confirmed)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true)];
    const next = confirmPass(pending, [1], undefined); // snapshot doesn't even contain 2
    expect(next.pending).toEqual([]);
    expect(next.stalled).toEqual([]);
  });

  test("coarse + token: confirmed only by a snapshot causally PAST the commit", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "100" })];
    // Snapshot watermark at the commit itself (equal) — not past it: kept, one miss.
    const atCommit = confirmPass(pending, [1, 2], "100", undefined);
    expect(ids(atCommit.pending)).toEqual(["a"]);
    expect(atCommit.pending[0]!.misses).toBe(1);
    // No watermark seen yet — no causal floor: kept.
    const noFloor = confirmPass(pending, [1, 2], undefined, undefined);
    expect(ids(noFloor.pending)).toEqual(["a"]);
    // Strictly past the commit: confirmed (exact causal coarse confirmation).
    const past = confirmPass(pending, [1, 2], "101", undefined);
    expect(past.pending).toEqual([]);
    expect(past.dropped).toEqual([]);
  });

  test("coarse + token compares causally (BigInt), never lexicographically", () => {
    // "9" < "10" as xid8 values, though "9" > "10" as strings.
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "9" })];
    expect(confirmPass(pending, [1, 2], "10", undefined).pending).toEqual([]);
  });

  test("coarse mode NEVER denies, even with a token the snapshot is past", () => {
    // Coarse has no isConfirmedBy to attest "the snapshot lacks my effect", so
    // a causally-later snapshot can only CONFIRM — dropping into `dropped`
    // (superseded) is content-mode-only.
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "100" })];
    const next = confirmPass(pending, [1], "500", undefined);
    expect(next.pending).toEqual([]); // confirmed (cmp > 0), not denied
    expect(next.dropped).toEqual([]);
  });
});

describe("confirmPass (content-based isConfirmedBy)", () => {
  // Cascade confirmation is scoped by op identity: ops on the same number are
  // "the same target". A newer confirmed write to a target supersedes older
  // resolved writes to THAT target only. `sameTarget` is required alongside
  // `isConfirmedBy`, so content-based mode is always the `{ isConfirmedBy,
  // sameTarget }` pair.

  test("only drops a resolved op when isConfirmedBy accepts the snapshot", () => {
    const pushOnly = {
      isConfirmedBy: (s: number[], v: Vars) => v.kind === "push" && s.includes(v.n),
      sameTarget: sameN,
    };
    const pending = [
      op("a", { kind: "push", n: 2 }, true),
      op("b", { kind: "push", n: 3 }, true),
    ];

    // Server only reflects 2 so far ⇒ a is confirmed, b is not.
    expect(ids(confirmPass(pending, [1, 2], undefined, pushOnly).pending)).toEqual(["b"]);
    // Server reflects both ⇒ both dropped.
    expect(confirmPass(pending, [1, 2, 3], undefined, pushOnly).pending).toEqual([]);
    // Server reflects neither ⇒ both kept (each with one miss).
    expect(ids(confirmPass(pending, [1], undefined, pushOnly).pending)).toEqual(["a", "b"]);
  });

  test("cascade (sameTarget): the stuck-inverse pair on ONE entity resolves", () => {
    // The stuck-inverse-pair scenario: undo removes 9 (resolved), redo pushes 9
    // back (resolved) before any push carrying the removal arrives. The eventual
    // snapshot shows 9 present — it confirms the redo but can never confirm the
    // undo. Without the same-target cascade the undo would replay "remove 9"
    // forever.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true),
      op("redo", { kind: "push", n: 9 }, true),
    ];
    expect(confirmPass(pending, [1, 9], undefined, content).pending).toEqual([]);
  });

  test("cascade never drops an older resolved op on an UNRELATED target", () => {
    const pushOnly = {
      isConfirmedBy: (s: number[], v: Vars) => v.kind === "push" && s.includes(v.n),
      sameTarget: sameN,
    };
    // Two independent entities: op "a" writes 2, op "b" writes 3. Both resolved;
    // the NEWER one's confirming push arrives first (snapshot has 3, not 2).
    // "a" must survive until its own push lands — dropping it would transiently
    // revert its entity to stale server data.
    const pending = [
      op("a", { kind: "push", n: 2 }, true), // resolved, not yet reflected
      op("b", { kind: "push", n: 3 }, true), // confirmed by this snapshot
    ];
    expect(ids(confirmPass(pending, [1, 3], undefined, pushOnly).pending)).toEqual(["a"]);
    // ...and the eventual push reflecting 2 confirms it normally.
    expect(confirmPass(pending, [1, 2, 3], undefined, pushOnly).pending).toEqual([]);
  });

  test("cascade never drops UNRESOLVED older ops, even on the same target", () => {
    const pushOnly = {
      isConfirmedBy: (s: number[], v: Vars) => v.kind === "push" && s.includes(v.n),
      sameTarget: sameN,
    };
    const pending = [
      op("a", { kind: "remove", n: 3 }, false), // still in flight — must survive
      op("b", { kind: "push", n: 3 }, true), // confirmed by the snapshot
    ];
    expect(ids(confirmPass(pending, [1, 3], undefined, pushOnly).pending)).toEqual(["a"]);
  });

  test("cascade leaves newer unconfirmed resolved ops alone", () => {
    const pushOnly = {
      isConfirmedBy: (s: number[], v: Vars) => v.kind === "push" && s.includes(v.n),
      sameTarget: sameN,
    };
    const pending = [
      op("a", { kind: "push", n: 2 }, true), // confirmed
      op("b", { kind: "remove", n: 2 }, true), // same target, newer, not yet reflected — kept
    ];
    expect(ids(confirmPass(pending, [1, 2], undefined, pushOnly).pending)).toEqual(["b"]);
  });
});

describe("causal denial (content mode + token — Rule B, strict >)", () => {
  // "deny" = the snapshot's watermark proves it saw the op's commit (or its
  // overwrite), yet isConfirmedBy still rejects it ⇒ the effect was overwritten
  // by newer server truth. The op is removed into `dropped` (superseded) —
  // rendering newer truth, never a revert.

  test("denied only under strict cmp(snapshotWm, ackWm) > 0", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "100" })];
    const snapshot = [1]; // does NOT reflect the op

    // Snapshot older than the commit: a stale read, carries no evidence — kept.
    const older = confirmPass(pending, snapshot, "99", content);
    expect(ids(older.pending)).toEqual(["a"]);
    expect(older.dropped).toEqual([]);

    // Snapshot AT the commit (equal): not strictly past — kept.
    const equal = confirmPass(pending, snapshot, "100", content);
    expect(ids(equal.pending)).toEqual(["a"]);
    expect(equal.dropped).toEqual([]);

    // Snapshot strictly past the commit: provably superseded — dropped.
    const past = confirmPass(pending, snapshot, "101", content);
    expect(past.pending).toEqual([]);
    expect(ids(past.dropped)).toEqual(["a"]);
    expect(past.stalled).toEqual([]);
  });

  test("no snapshot watermark ⇒ no causal floor ⇒ never denied", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "100" })];
    const next = confirmPass(pending, [1], undefined, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.dropped).toEqual([]);
  });

  test("tokenless ops are NEVER denied — misses only ever trigger the stalled report", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true)]; // no ackWatermark
    let cur = pending as ReadonlyArray<PendingOp<Vars>>;
    // Push far past any commit, many more times than the report threshold: the
    // op survives every single one (no eviction path exists for it).
    for (let i = 0; i < DIVERGENCE_REPORT_MISSES * 3; i++) {
      const next = confirmPass(cur, [1], "999999", content);
      expect(next.dropped).toEqual([]);
      expect(ids(next.pending)).toEqual(["a"]);
      cur = next.pending;
    }
    expect(cur[0]!.misses).toBe(DIVERGENCE_REPORT_MISSES * 3);
  });

  test("a cascade-superseded op is dropped silently, never denied/reported", () => {
    // "undo" would ALSO be deniable (token, snapshot past it) — but the cascade
    // claims it first: superseded by its own newer same-target sibling is the
    // healthy path and must not file a report.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true, { ackWatermark: "100" }),
      op("redo", { kind: "push", n: 9 }, true),
    ];
    const next = confirmPass(pending, [1, 9], "500", content);
    expect(next.pending).toEqual([]);
    expect(next.dropped).toEqual([]);
    expect(next.stalled).toEqual([]);
  });

  test("unresolved ops are never denied, token or not", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false, { ackWatermark: "100" })];
    const next = confirmPass(pending, [1], "500", content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.dropped).toEqual([]);
  });

  test("a confirming snapshot wins over denial (content match is always safe)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "100" })];
    const next = confirmPass(pending, [1, 2], "500", content);
    expect(next.pending).toEqual([]);
    expect(next.dropped).toEqual([]); // confirmed, not denied
  });
});

describe("resolvePass (the resolve edge)", () => {
  test("content-based: a push that landed BEFORE the response still confirms the op", () => {
    // The measured production ordering: the confirming push arrives ~1ms before
    // the HTTP response. Under the old push-only confirmation the op sat
    // resolved-and-unconfirmed forever. Now the resolve edge re-asks the cache.
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", [1, 2], 1, undefined, undefined, content);
    expect(next.pending).toEqual([]);
    expect(next.dropped).toEqual([]);
  });

  test("content-based: an unreflected snapshot keeps the op resolved, with NO miss", () => {
    // No new snapshot arrived, so a non-confirmation carries no evidence.
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", [1], 1, undefined, undefined, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.resolved).toBe(true);
    expect(next.pending[0]!.misses).toBe(0);
  });

  test("content-based: no snapshot at all (serverData undefined) keeps the op", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", undefined, 0, undefined, undefined, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.resolved).toBe(true);
    expect(next.pending[0]!.misses).toBe(0);
    expect(next.dropped).toEqual([]);
  });

  test("content-based: an op an EMPTY base would 'confirm' must not confirm on no snapshot", () => {
    // The `initialData` hazard. `isConfirmedBy([], remove 9)` is TRUE — an empty
    // base vacuously reflects a removal. The caller must pass `undefined` until
    // an authoritative snapshot lands (the hook gates on `dataUpdatedAt > 0`);
    // were the placeholder passed through, this op would be dropped as confirmed
    // against data the server never sent. Same shape as the page editor's
    // `isReflected([], {kind:"remove"})` and its update-only `isPatchReflected`.
    expect(isConfirmedBy([], { kind: "remove", n: 9 })).toBe(true);

    const pending = [op("a", { kind: "remove", n: 9 })];
    const next = resolvePass(pending, "a", undefined, 0, undefined, undefined, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.misses).toBe(0);
    expect(next.dropped).toEqual([]);
  });

  test("content-based: confirming at the resolve edge runs the same-target cascade", () => {
    // undo(remove 9) resolved and stuck; redo(push 9) resolves now against a
    // snapshot showing 9 present ⇒ redo confirms and cascades the undo away.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true),
      op("redo", { kind: "push", n: 9 }),
    ];
    expect(resolvePass(pending, "redo", [1, 9], 4, undefined, undefined, content).pending).toEqual([]);
  });

  test("resolvePass NEVER denies, even in content mode with a causally-past snapshot", () => {
    // A stuck older op with a token the current watermark is past: denial is a
    // push-edge-only verdict (no NEW snapshot arrived here).
    const pending = [
      op("stuck", { kind: "push", n: 2 }, true, { ackWatermark: "100" }),
      op("b", { kind: "push", n: 3 }),
    ];
    const next = resolvePass(pending, "b", [1], 1, "500", undefined, content);
    expect(ids(next.pending)).toEqual(["stuck", "b"]);
    expect(next.dropped).toEqual([]);
  });

  test("stamps the endpoint's ackWatermark on the resolving op", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", [1], 1, undefined, "123", content);
    expect(next.pending[0]!.ackWatermark).toBe("123");
  });

  test("clears a prior failure — a retried op that succeeds is no longer failed", () => {
    const pending = markFailed(
      [op("a", { kind: "push", n: 2 })],
      "a",
      { kind: "network" },
    );
    const next = resolvePass(pending, "a", [1], 1, undefined, undefined, content);
    expect(next.pending[0]!.failure).toBeUndefined();
    expect(next.pending[0]!.resolved).toBe(true);
  });

  test("coarse + token: confirms iff the cached snapshot is causally past the commit", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false, { dispatchGen: 7 })];
    // Snapshot watermark past the just-returned ack ⇒ the cached value already
    // contains this commit — confirmed, regardless of the generation counter.
    expect(resolvePass(pending, "a", [1, 2], 7, "101", "100").pending).toEqual([]);
    // Watermark at/older than the ack ⇒ kept (the gen stamp is NOT consulted
    // once a token exists — the token is strictly more precise).
    const kept = resolvePass(pending, "a", [1, 2], 8, "100", "100");
    expect(ids(kept.pending)).toEqual(["a"]);
    expect(kept.pending[0]!.resolved).toBe(true);
  });

  test("coarse tokenless: gen > dispatchGen confirms (a push landed since dispatch)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false, { dispatchGen: 7 })];
    expect(resolvePass(pending, "a", [1, 2], 8, undefined, undefined).pending).toEqual([]);
  });

  test("coarse tokenless: gen === dispatchGen keeps the op (no push has landed yet)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false, { dispatchGen: 7 })];
    const next = resolvePass(pending, "a", [1, 2], 7, undefined, undefined);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.resolved).toBe(true);
    // ...and the next authoritative push confirms it coarsely.
    expect(confirmPass(next.pending, [1, 2], undefined).pending).toEqual([]);
  });

  test("only the resolving op is marked resolved; siblings are untouched", () => {
    const pending = [
      op("a", { kind: "push", n: 2 }, false, { dispatchGen: 1 }),
      op("b", { kind: "push", n: 3 }, false, { dispatchGen: 1 }),
    ];
    const next = resolvePass(pending, "b", [1], 1, undefined, undefined); // coarse, gen === dispatchGen
    expect(next.pending.map((o) => [o.opId, o.resolved])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  test("an unknown opId is a no-op and returns the input by identity", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "missing", [1], 5, undefined, undefined, content);
    expect(next.pending).toEqual(pending);
    expect(next.dropped).toEqual([]);
  });
});

describe("stalled reporting (miss counting — report-only, never evicts)", () => {
  test("each unconfirming push bumps a resolved op's miss count", () => {
    let pending: ReadonlyArray<PendingOp<Vars>> = [op("a", { kind: "push", n: 2 }, true)];
    pending = confirmPass(pending, [1], undefined, content).pending;
    expect(pending[0]!.misses).toBe(1);
    pending = confirmPass(pending, [1], undefined, content).pending;
    expect(pending[0]!.misses).toBe(2);
  });

  test(`crossing ${DIVERGENCE_REPORT_MISSES} misses reports the op as stalled and KEEPS it`, () => {
    let pending: ReadonlyArray<PendingOp<Vars>> = [
      op("a", { kind: "push", n: 2 }, true),
      op("b", { kind: "push", n: 3 }, false), // unresolved — never accrues misses
    ];
    for (let i = 1; i < DIVERGENCE_REPORT_MISSES; i++) {
      const next = confirmPass(pending, [1], undefined, content);
      expect(next.stalled).toEqual([]);
      pending = next.pending;
    }
    const crossing = confirmPass(pending, [1], undefined, content);
    // The op is reported once AND stays in the overlay — no eviction, no revert.
    expect(ids(crossing.pending)).toEqual(["a", "b"]);
    expect(ids(crossing.stalled)).toEqual(["a"]);
    expect(crossing.stalled[0]!.misses).toBe(DIVERGENCE_REPORT_MISSES);
    expect(crossing.pending[0]!.divergenceReported).toBe(true);
    expect(crossing.pending[1]!.misses).toBe(0); // unresolved op untouched

    // The latch: further unconfirming pushes keep the op, report nothing more.
    const after = confirmPass(crossing.pending, [1], undefined, content);
    expect(ids(after.pending)).toEqual(["a", "b"]);
    expect(after.stalled).toEqual([]);
    expect(after.pending[0]!.misses).toBe(DIVERGENCE_REPORT_MISSES + 1);
  });

  test("a stalled (reported) op is still confirmable by a later matching snapshot", () => {
    // The whole point of never evicting: under push lag the misses were stale
    // snapshots; when the real one arrives the op confirms and leaves cleanly.
    const pending = [
      op("a", { kind: "push", n: 2 }, true, {
        misses: DIVERGENCE_REPORT_MISSES + 2,
        divergenceReported: true,
      }),
    ];
    const next = confirmPass(pending, [1, 2], undefined, content);
    expect(next.pending).toEqual([]);
    expect(next.stalled).toEqual([]);
    expect(next.dropped).toEqual([]);
  });

  test("a confirming push resets nothing — the op simply leaves before stalling", () => {
    let pending: ReadonlyArray<PendingOp<Vars>> = [op("a", { kind: "push", n: 2 }, true)];
    pending = confirmPass(pending, [1], undefined, content).pending;
    expect(pending[0]!.misses).toBe(1);
    const next = confirmPass(pending, [1, 2], undefined, content);
    expect(next.pending).toEqual([]);
    expect(next.stalled).toEqual([]);
  });

  test("cascade-dropped ops are NEVER reported, however many misses", () => {
    // "undo" has already missed LIMIT-1 pushes. This push confirms "redo" (same
    // target), so "undo" is cascade-absorbed — expected, not a divergence.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true, { misses: DIVERGENCE_REPORT_MISSES - 1 }),
      op("redo", { kind: "push", n: 9 }, true),
    ];
    const next = confirmPass(pending, [1, 9], undefined, content);
    expect(next.pending).toEqual([]);
    expect(next.stalled).toEqual([]);
    expect(next.dropped).toEqual([]);
  });

  test("resolvePass never counts a miss, so it can never stall an op", () => {
    const pending = [
      op("a", { kind: "push", n: 2 }, true, { misses: DIVERGENCE_REPORT_MISSES - 1 }),
      op("b", { kind: "push", n: 3 }),
    ];
    const next = resolvePass(pending, "b", [1], 1, undefined, undefined, content);
    expect(next.stalled).toEqual([]);
    expect(next.pending[0]!.misses).toBe(DIVERGENCE_REPORT_MISSES - 1);
  });
});

describe("exact-ack confirmation (the ackTx registry probe)", () => {
  // `hasAck` is the registry-membership probe: "did the server broadcast this
  // op's commit txid in a frame's ackTx for my tuple?". It CONFIRMS exactly and
  // NEVER denies — denial stays snapshot-watermark-only (Rule B′ untouched).
  const ackOf = (...txids: string[]) => (txid: string) => txids.includes(txid);

  test("confirmPass coarse: an acked resolved op confirms even with NO snapshot watermark and an unreflected snapshot", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "100" })];
    // Without the ack: kept (no causal floor), one miss.
    const unacked = confirmPass(pending, [1], undefined, undefined, ackOf());
    expect(ids(unacked.pending)).toEqual(["a"]);
    // With the ack: confirmed (dropped from pending, NOT into `dropped`).
    const acked = confirmPass(pending, [1], undefined, undefined, ackOf("100"));
    expect(acked.pending).toEqual([]);
    expect(acked.dropped).toEqual([]);
  });

  test("confirmPass content: the ack confirms an op isConfirmedBy rejects, and feeds the same-target cascade", () => {
    // The stuck-inverse shape, resolved via the ack instead of content: "redo"
    // is acked; "undo" (same target, older, resolved, never content-matched) is
    // cascade-absorbed by the confirmed redo.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true),
      op("redo", { kind: "push", n: 9 }, true, { ackWatermark: "200" }),
    ];
    // Snapshot reflects NEITHER op's content ([1] has no 9 present for redo).
    const next = confirmPass(pending, [1], undefined, content, ackOf("200"));
    expect(next.pending).toEqual([]);
    expect(next.dropped).toEqual([]);
    expect(next.stalled).toEqual([]);
  });

  test("resolvePass (both modes): the just-stamped token confirms when the registry already remembers it (delta-before-response race)", () => {
    // The frame carrying this commit's ackTx landed BEFORE the HTTP response —
    // the resolve edge probes the registry with the freshly-stamped token.
    const pending = [op("a", { kind: "push", n: 2 })];
    const contentNext = resolvePass(pending, "a", [1], 1, undefined, "300", content, ackOf("300"));
    expect(contentNext.pending).toEqual([]);
    const coarseNext = resolvePass(pending, "a", [1], 1, undefined, "300", undefined, ackOf("300"));
    expect(coarseNext.pending).toEqual([]);
    // Registry miss: unchanged from before (content: kept resolved, no miss).
    const missNext = resolvePass(pending, "a", [1], 1, undefined, "300", content, ackOf());
    expect(ids(missNext.pending)).toEqual(["a"]);
  });

  test("ackPass drops acked resolved ops, counts NO miss, never denies, and returns the input by identity when nothing changed", () => {
    const pending = [
      op("acked", { kind: "push", n: 2 }, true, { ackWatermark: "400", misses: 1 }),
      op("other", { kind: "push", n: 3 }, true, { ackWatermark: "401", misses: 1 }),
      op("inflight", { kind: "push", n: 4 }, false, { ackWatermark: "400" }), // unresolved — untouchable
    ];
    const next = ackPass(pending, ackOf("400"), sameN);
    expect(ids(next.pending)).toEqual(["other", "inflight"]);
    expect(next.dropped).toEqual([]); // an ack never denies
    expect(next.stalled).toEqual([]);
    expect(next.pending[0]!.misses).toBe(1); // no miss counted on the ack edge

    // Nothing acked ⇒ the SAME array reference (the React shell's bail-out).
    const idle = ackPass(pending, ackOf(), sameN);
    expect(idle.pending).toBe(pending);
  });

  test("ackPass cascades same-target older resolved ops with the acked one", () => {
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true), // older, same target, tokenless
      op("redo", { kind: "push", n: 9 }, true, { ackWatermark: "500" }),
    ];
    const next = ackPass(pending, ackOf("500"), sameN);
    expect(next.pending).toEqual([]);
    expect(next.dropped).toEqual([]);
  });

  test("tokenless ops are unaffected by every ack edge", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true)]; // no ackWatermark
    expect(ackPass(pending, () => true).pending).toBe(pending);
    // …and the confirm passes don't consult hasAck for them either (content
    // mode: unreflected snapshot keeps the op with a miss, exactly as before).
    const next = confirmPass(pending, [1], undefined, content, () => true);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.misses).toBe(1);
  });

  test("denial stays watermark-only: an UN-acked op is denied by a causally-past snapshot exactly as before", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true, { ackWatermark: "600" })];
    const next = confirmPass(pending, [1], "601", content, ackOf());
    expect(next.pending).toEqual([]);
    expect(ids(next.dropped)).toEqual(["a"]); // superseded — the ack registry played no part
  });
});

describe("markResolved", () => {
  test("marks the matching op resolved, preserves order and the rest", () => {
    const pending = [op("a", { kind: "push", n: 2 }), op("b", { kind: "push", n: 3 })];
    const next = markResolved(pending, "b");
    expect(next.map((o) => [o.opId, o.resolved])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  test("is a no-op when the opId is absent", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    expect(markResolved(pending, "missing")).toEqual(pending);
  });
});

describe("integration: chained dispatch + interleaved push + failure", () => {
  test("two dispatches, a push confirming the first, then the second fails and retries", () => {
    const base = [1];
    let pending: ReadonlyArray<PendingOp<Vars>> = [];

    // dispatch a
    pending = [...pending, op("a", { kind: "push", n: 2 })];
    // dispatch b
    pending = [...pending, op("b", { kind: "push", n: 3 })];
    expect(replay(base, pending, applyNums)).toEqual([1, 2, 3]);

    // a's mutate resolves; b's REJECTS at the network level — b stays rendered.
    pending = resolvePass(pending, "a", base, 0, undefined, undefined, content).pending;
    pending = markFailed(pending, "b", { kind: "network" });
    expect(replay(base, pending, applyNums)).toEqual([1, 2, 3]);

    // server push reflecting only a; b (failed ⇒ unresolved) is untouchable.
    const next = confirmPass(pending, [1, 2], undefined, content);
    expect(ids(next.pending)).toEqual(["b"]);
    expect(replay([1, 2], next.pending, applyNums)).toEqual([1, 2, 3]);

    // reconnect edge: retry in place — clear the failure, re-fire, resolve.
    pending = clearFailure(next.pending, "b");
    pending = resolvePass(pending, "b", [1, 2], 1, undefined, undefined, content).pending;
    expect(ids(pending)).toEqual(["b"]); // resolved, awaiting its push
    expect(confirmPass(pending, [1, 2, 3], undefined, content).pending).toEqual([]);
  });

  test("the push-before-resolve ordering: one dispatch, push, then resolve ⇒ empty overlay", () => {
    // The exact production trace: fetch sent at t=0, WS push at t=83ms (op still
    // unresolved ⇒ survives confirmPass), response at t=84ms. The resolve edge
    // must confirm against the already-arrived snapshot.
    let pending: ReadonlyArray<PendingOp<Vars>> = [
      op("a", { kind: "push", n: 2 }, false, { dispatchGen: 5 }),
    ];
    // The push: the op is unresolved, so nothing is dropped.
    const afterPush = confirmPass(pending, [1, 2], undefined, content);
    expect(ids(afterPush.pending)).toEqual(["a"]);
    pending = afterPush.pending;
    // The response: gen advanced to 6, and the snapshot already reflects the op.
    const afterResolve = resolvePass(pending, "a", [1, 2], 6, undefined, undefined, content);
    expect(afterResolve.pending).toEqual([]);
    // Tokenless coarse consumers get the same outcome via the gen stamp alone.
    expect(resolvePass(pending, "a", [1, 2], 6, undefined, undefined).pending).toEqual([]);
  });

  test("the motivating bug: stale snapshots after the commit can never evict a split", () => {
    // Production trace pageId block-1783508240248-6o4jvk: a server-acked
    // `split` op saw 3 pushes whose snapshots were computed BEFORE the split
    // committed (push lag — delivery order is not causality). The old
    // miss-limit eviction dropped the op and the block vanished mid-typing.
    // Now: without a causal proof the op survives indefinitely (stalled report
    // only), and WITH a token, stale snapshots (watermark ≤ ack) still cannot
    // deny it — only a snapshot provably past the commit that lacks its effect
    // may drop it.
    const acked = op("split", { kind: "push", n: 2 }, true, { ackWatermark: "200" });
    let pending: ReadonlyArray<PendingOp<Vars>> = [acked];
    for (let i = 0; i < DIVERGENCE_REPORT_MISSES + 2; i++) {
      const next = confirmPass(pending, [1], "150", content); // stale: 150 < 200
      expect(next.dropped).toEqual([]);
      expect(ids(next.pending)).toEqual(["split"]);
      pending = next.pending;
    }
    // The real (causally-later) snapshot arrives carrying the split ⇒ confirmed.
    expect(confirmPass(pending, [1, 2], "201", content).pending).toEqual([]);
  });
});
