/**
 * Tests for the pure overlay/replay logic of the optimistic-mutation primitive.
 * Run with `bun test plugins/primitives/plugins/optimistic-mutation/`.
 *
 * The hook (`use-optimistic-resource.ts`) is a thin React shell over these
 * functions; the WHOLE op lifecycle (dispatch → resolve → confirm → diverge)
 * lives here, so testing them directly exercises the load-bearing invariants
 * (ordered replay, base rebase, error drop, both confirmation edges, the
 * same-target cascade, miss counting, divergence, throwing-apply drop) without
 * a render.
 */

import { test, expect, describe } from "bun:test";
import {
  confirmPass,
  DIVERGENCE_MISS_LIMIT,
  markResolved,
  OpNoLongerApplies,
  removeOp,
  replay,
  resolvePass,
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
  extra: { dispatchGen?: number; misses?: number } = {},
): PendingOp<Vars> {
  return {
    opId,
    vars,
    resolved,
    dispatchGen: extra.dispatchGen ?? 0,
    misses: extra.misses ?? 0,
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

describe("error rollback (removeOp)", () => {
  test("(3) a rejected op is removed without disturbing other in-flight ops", () => {
    const base = [1];
    const pending = [
      op("a", { kind: "push", n: 2 }),
      op("b", { kind: "push", n: 99 }), // this one will reject
      op("c", { kind: "push", n: 3 }),
    ];
    // Before rollback the failing op is still optimistically applied.
    expect(replay(base, pending, applyNums)).toEqual([1, 2, 99, 3]);

    // Reject path removes only op "b"; "a" and "c" survive in order.
    const afterReject = removeOp(pending, "b");
    expect(ids(afterReject)).toEqual(["a", "c"]);
    expect(replay(base, afterReject, applyNums)).toEqual([1, 2, 3]);
  });
});

describe("confirmPass (coarse)", () => {
  test("(4) coarse confirmation clears a resolved op after a push, keeps in-flight ops", () => {
    const pending = [
      op("a", { kind: "push", n: 2 }, true), // resolved ⇒ a push confirms it
      op("b", { kind: "push", n: 3 }, false), // still in flight ⇒ kept
    ];
    const serverData = [1, 2]; // server now reflects op a
    const next = confirmPass(pending, serverData);
    expect(ids(next.pending)).toEqual(["b"]);
    expect(next.diverged).toEqual([]);
  });

  test("unresolved ops are never dropped, even on a push", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false)];
    const next = confirmPass(pending, [1, 2]);
    expect(ids(next.pending)).toEqual(["a"]);
    // Nothing changed ⇒ the SAME array reference comes back (the shell's bail-out).
    expect(next.pending).toBe(pending);
  });

  test("coarse never accrues misses (every resolved op is confirmed)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, true)];
    const next = confirmPass(pending, [1]); // snapshot doesn't even contain 2
    expect(next.pending).toEqual([]);
    expect(next.diverged).toEqual([]);
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
    expect(ids(confirmPass(pending, [1, 2], pushOnly).pending)).toEqual(["b"]);
    // Server reflects both ⇒ both dropped.
    expect(confirmPass(pending, [1, 2, 3], pushOnly).pending).toEqual([]);
    // Server reflects neither ⇒ both kept (each with one miss).
    expect(ids(confirmPass(pending, [1], pushOnly).pending)).toEqual(["a", "b"]);
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
    expect(confirmPass(pending, [1, 9], content).pending).toEqual([]);
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
    expect(ids(confirmPass(pending, [1, 3], pushOnly).pending)).toEqual(["a"]);
    // ...and the eventual push reflecting 2 confirms it normally.
    expect(confirmPass(pending, [1, 2, 3], pushOnly).pending).toEqual([]);
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
    expect(ids(confirmPass(pending, [1, 3], pushOnly).pending)).toEqual(["a"]);
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
    expect(ids(confirmPass(pending, [1, 2], pushOnly).pending)).toEqual(["b"]);
  });
});

describe("resolvePass (the resolve edge)", () => {
  test("content-based: a push that landed BEFORE the response still confirms the op", () => {
    // The measured production ordering: the confirming push arrives ~1ms before
    // the HTTP response. Under the old push-only confirmation the op sat
    // resolved-and-unconfirmed forever. Now the resolve edge re-asks the cache.
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", [1, 2], 1, content);
    expect(next.pending).toEqual([]);
    expect(next.diverged).toEqual([]);
  });

  test("content-based: an unreflected snapshot keeps the op resolved, with NO miss", () => {
    // No new snapshot arrived, so a non-confirmation carries no evidence.
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", [1], 1, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.resolved).toBe(true);
    expect(next.pending[0]!.misses).toBe(0);
  });

  test("content-based: no snapshot at all (serverData undefined) keeps the op", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "a", undefined, 0, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.resolved).toBe(true);
    expect(next.pending[0]!.misses).toBe(0);
    expect(next.diverged).toEqual([]);
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
    const next = resolvePass(pending, "a", undefined, 0, content);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.misses).toBe(0);
    expect(next.diverged).toEqual([]);
  });

  test("content-based: confirming at the resolve edge runs the same-target cascade", () => {
    // undo(remove 9) resolved and stuck; redo(push 9) resolves now against a
    // snapshot showing 9 present ⇒ redo confirms and cascades the undo away.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true),
      op("redo", { kind: "push", n: 9 }),
    ];
    expect(resolvePass(pending, "redo", [1, 9], 4, content).pending).toEqual([]);
  });

  test("coarse: gen > dispatchGen confirms (a push landed since dispatch)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false, { dispatchGen: 7 })];
    expect(resolvePass(pending, "a", [1, 2], 8).pending).toEqual([]);
  });

  test("coarse: gen === dispatchGen keeps the op (no push has landed yet)", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false, { dispatchGen: 7 })];
    const next = resolvePass(pending, "a", [1, 2], 7);
    expect(ids(next.pending)).toEqual(["a"]);
    expect(next.pending[0]!.resolved).toBe(true);
    // ...and the next authoritative push confirms it coarsely.
    expect(confirmPass(next.pending, [1, 2]).pending).toEqual([]);
  });

  test("only the resolving op is marked resolved; siblings are untouched", () => {
    const pending = [
      op("a", { kind: "push", n: 2 }, false, { dispatchGen: 1 }),
      op("b", { kind: "push", n: 3 }, false, { dispatchGen: 1 }),
    ];
    const next = resolvePass(pending, "b", [1], 1); // coarse, gen === dispatchGen
    expect(next.pending.map((o) => [o.opId, o.resolved])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  test("an unknown opId is a no-op and returns the input by identity", () => {
    const pending = [op("a", { kind: "push", n: 2 })];
    const next = resolvePass(pending, "missing", [1], 5, content);
    expect(next.pending).toEqual(pending);
    expect(next.diverged).toEqual([]);
  });
});

describe("divergence detection (miss counting)", () => {
  test("each unconfirming push bumps a resolved op's miss count", () => {
    let pending: ReadonlyArray<PendingOp<Vars>> = [op("a", { kind: "push", n: 2 }, true)];
    pending = confirmPass(pending, [1], content).pending;
    expect(pending[0]!.misses).toBe(1);
    pending = confirmPass(pending, [1], content).pending;
    expect(pending[0]!.misses).toBe(2);
  });

  test(`the ${DIVERGENCE_MISS_LIMIT}rd miss drops the op and returns it in diverged`, () => {
    let pending: ReadonlyArray<PendingOp<Vars>> = [
      op("a", { kind: "push", n: 2 }, true),
      op("b", { kind: "push", n: 3 }, false), // unresolved — never accrues misses
    ];
    for (let i = 1; i < DIVERGENCE_MISS_LIMIT; i++) {
      const next = confirmPass(pending, [1], content);
      expect(next.diverged).toEqual([]);
      pending = next.pending;
    }
    const final = confirmPass(pending, [1], content);
    expect(ids(final.pending)).toEqual(["b"]); // the diverged op left the overlay
    expect(ids(final.diverged)).toEqual(["a"]);
    expect(final.diverged[0]!.misses).toBe(DIVERGENCE_MISS_LIMIT);
    expect(final.pending[0]!.misses).toBe(0); // unresolved op untouched
  });

  test("a confirming push resets nothing — the op simply leaves before diverging", () => {
    let pending: ReadonlyArray<PendingOp<Vars>> = [op("a", { kind: "push", n: 2 }, true)];
    pending = confirmPass(pending, [1], content).pending;
    expect(pending[0]!.misses).toBe(1);
    const next = confirmPass(pending, [1, 2], content);
    expect(next.pending).toEqual([]);
    expect(next.diverged).toEqual([]);
  });

  test("cascade-dropped ops are NEVER reported as diverged, however many misses", () => {
    // "undo" has already missed LIMIT-1 pushes. This push confirms "redo" (same
    // target), so "undo" is cascade-absorbed — expected, not a divergence.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true, { misses: DIVERGENCE_MISS_LIMIT - 1 }),
      op("redo", { kind: "push", n: 9 }, true),
    ];
    const next = confirmPass(pending, [1, 9], content);
    expect(next.pending).toEqual([]);
    expect(next.diverged).toEqual([]);
  });

  test("resolvePass never counts a miss, so it can never diverge an op", () => {
    const pending = [
      op("a", { kind: "push", n: 2 }, true, { misses: DIVERGENCE_MISS_LIMIT - 1 }),
      op("b", { kind: "push", n: 3 }),
    ];
    const next = resolvePass(pending, "b", [1], 1, content);
    expect(next.diverged).toEqual([]);
    expect(next.pending[0]!.misses).toBe(DIVERGENCE_MISS_LIMIT - 1);
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

describe("integration: chained dispatch + interleaved push + reject", () => {
  test("two dispatches, a push confirming the first, then the second rejects", () => {
    const base = [1];
    let pending: ReadonlyArray<PendingOp<Vars>> = [];

    // dispatch a
    pending = [...pending, op("a", { kind: "push", n: 2 })];
    // dispatch b
    pending = [...pending, op("b", { kind: "push", n: 3 })];
    expect(replay(base, pending, applyNums)).toEqual([1, 2, 3]);

    // both mutate() resolve, with no snapshot yet reflecting either
    pending = resolvePass(pending, "a", base, 0, content).pending;
    pending = resolvePass(pending, "b", base, 0, content).pending;

    // server push reflecting only a; coarse confirmation would drop BOTH
    // resolved ops, but content-based keeps b until the server reflects it.
    const next = confirmPass(pending, [1, 2], content);
    expect(ids(next.pending)).toEqual(["b"]);

    // the push moved base forward to [1,2]; b still replays on top
    expect(replay([1, 2], next.pending, applyNums)).toEqual([1, 2, 3]);
  });

  test("the push-before-resolve ordering: one dispatch, push, then resolve ⇒ empty overlay", () => {
    // The exact production trace: fetch sent at t=0, WS push at t=83ms (op still
    // unresolved ⇒ survives confirmPass), response at t=84ms. The resolve edge
    // must confirm against the already-arrived snapshot.
    let pending: ReadonlyArray<PendingOp<Vars>> = [
      op("a", { kind: "push", n: 2 }, false, { dispatchGen: 5 }),
    ];
    // The push: the op is unresolved, so nothing is dropped.
    const afterPush = confirmPass(pending, [1, 2], content);
    expect(ids(afterPush.pending)).toEqual(["a"]);
    pending = afterPush.pending;
    // The response: gen advanced to 6, and the snapshot already reflects the op.
    const afterResolve = resolvePass(pending, "a", [1, 2], 6, content);
    expect(afterResolve.pending).toEqual([]);
    // Coarse consumers get the same outcome via the gen stamp alone.
    expect(resolvePass(pending, "a", [1, 2], 6).pending).toEqual([]);
  });
});
