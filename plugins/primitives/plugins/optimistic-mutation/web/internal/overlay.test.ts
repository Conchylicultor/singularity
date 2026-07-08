/**
 * Tests for the pure overlay/replay logic of the optimistic-mutation primitive.
 * Run with `bun test plugins/primitives/plugins/optimistic-mutation/`.
 *
 * The hook (`use-optimistic-resource.ts`) is a thin React shell over these
 * functions; testing them directly exercises the load-bearing invariants
 * (ordered replay, base rebase, error drop, confirmation, throwing-apply drop)
 * without a render.
 */

import { test, expect, describe } from "bun:test";
import {
  confirmPass,
  markResolved,
  OpNoLongerApplies,
  removeOp,
  replay,
  type PendingOp,
} from "./overlay";

// A toy domain: an ordered list of numbers; ops push or remove a number.
type Vars = { kind: "push"; n: number } | { kind: "remove"; n: number };

function applyNums(current: number[], vars: Vars): number[] {
  if (vars.kind === "push") return [...current, vars.n];
  return current.filter((x) => x !== vars.n);
}

function op(opId: string, vars: Vars, resolved = false): PendingOp<Vars> {
  return { opId, vars, resolved };
}

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
    expect(afterReject.map((o) => o.opId)).toEqual(["a", "c"]);
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
    expect(next.map((o) => o.opId)).toEqual(["b"]);
  });

  test("unresolved ops are never dropped, even on a push", () => {
    const pending = [op("a", { kind: "push", n: 2 }, false)];
    expect(confirmPass(pending, [1, 2]).map((o) => o.opId)).toEqual(["a"]);
  });
});

describe("confirmPass (content-based isConfirmedBy)", () => {
  // Cascade confirmation is scoped by op identity: ops on the same number are
  // "the same target". A newer confirmed write to a target supersedes older
  // resolved writes to THAT target only. `sameTarget` is required alongside
  // `isConfirmedBy`, so content-based mode is always the `{ isConfirmedBy,
  // sameTarget }` pair.
  const sameN = (a: Vars, b: Vars): boolean => a.n === b.n;

  test("only drops a resolved op when isConfirmedBy accepts the snapshot", () => {
    const isConfirmedBy = (serverData: number[], vars: Vars): boolean =>
      vars.kind === "push" && serverData.includes(vars.n);

    const pending = [
      op("a", { kind: "push", n: 2 }, true),
      op("b", { kind: "push", n: 3 }, true),
    ];

    // Server only reflects 2 so far ⇒ a is confirmed, b is not.
    expect(
      confirmPass(pending, [1, 2], { isConfirmedBy, sameTarget: sameN }).map((o) => o.opId),
    ).toEqual(["b"]);
    // Server reflects both ⇒ both dropped.
    expect(confirmPass(pending, [1, 2, 3], { isConfirmedBy, sameTarget: sameN })).toEqual([]);
    // Server reflects neither ⇒ both kept.
    expect(
      confirmPass(pending, [1], { isConfirmedBy, sameTarget: sameN }).map((o) => o.opId),
    ).toEqual(["a", "b"]);
  });

  test("cascade (sameTarget): the stuck-inverse pair on ONE entity resolves", () => {
    const isConfirmedBy = (serverData: number[], vars: Vars): boolean =>
      vars.kind === "push"
        ? serverData.includes(vars.n)
        : !serverData.includes(vars.n);

    // The stuck-inverse-pair scenario: undo removes 9 (resolved), redo pushes 9
    // back (resolved) before any push carrying the removal arrives. The eventual
    // snapshot shows 9 present — it confirms the redo but can never confirm the
    // undo. Without the same-target cascade the undo would replay "remove 9"
    // forever.
    const pending = [
      op("undo", { kind: "remove", n: 9 }, true),
      op("redo", { kind: "push", n: 9 }, true),
    ];
    expect(confirmPass(pending, [1, 9], { isConfirmedBy, sameTarget: sameN })).toEqual([]);
  });

  test("cascade never drops an older resolved op on an UNRELATED target", () => {
    const isConfirmedBy = (serverData: number[], vars: Vars): boolean =>
      vars.kind === "push" && serverData.includes(vars.n);
    // Two independent entities: op "a" writes 2, op "b" writes 3. Both resolved;
    // the NEWER one's confirming push arrives first (snapshot has 3, not 2).
    // "a" must survive until its own push lands — dropping it would transiently
    // revert its entity to stale server data.
    const pending = [
      op("a", { kind: "push", n: 2 }, true), // resolved, not yet reflected
      op("b", { kind: "push", n: 3 }, true), // confirmed by this snapshot
    ];
    expect(
      confirmPass(pending, [1, 3], { isConfirmedBy, sameTarget: sameN }).map((o) => o.opId),
    ).toEqual(["a"]);
    // ...and the eventual push reflecting 2 confirms it normally.
    expect(confirmPass(pending, [1, 2, 3], { isConfirmedBy, sameTarget: sameN })).toEqual([]);
  });

  test("cascade never drops UNRESOLVED older ops, even on the same target", () => {
    const isConfirmedBy = (serverData: number[], vars: Vars): boolean =>
      vars.kind === "push" && serverData.includes(vars.n);
    const pending = [
      op("a", { kind: "remove", n: 3 }, false), // still in flight — must survive
      op("b", { kind: "push", n: 3 }, true), // confirmed by the snapshot
    ];
    expect(
      confirmPass(pending, [1, 3], { isConfirmedBy, sameTarget: sameN }).map((o) => o.opId),
    ).toEqual(["a"]);
  });

  test("cascade leaves newer unconfirmed resolved ops alone", () => {
    const isConfirmedBy = (serverData: number[], vars: Vars): boolean =>
      vars.kind === "push" && serverData.includes(vars.n);
    const pending = [
      op("a", { kind: "push", n: 2 }, true), // confirmed
      op("b", { kind: "remove", n: 2 }, true), // same target, newer, not yet reflected — kept
    ];
    expect(
      confirmPass(pending, [1, 2], { isConfirmedBy, sameTarget: sameN }).map((o) => o.opId),
    ).toEqual(["b"]);
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
    let pending: PendingOp<Vars>[] = [];

    // dispatch a
    pending = [...pending, op("a", { kind: "push", n: 2 })];
    // dispatch b
    pending = [...pending, op("b", { kind: "push", n: 3 })];
    expect(replay(base, pending, applyNums)).toEqual([1, 2, 3]);

    // both mutate() resolve
    pending = markResolved(pending, "a");
    pending = markResolved(pending, "b");

    // server push reflecting only a; coarse confirmation would drop BOTH
    // resolved ops, but content-based keeps b until the server reflects it.
    const isConfirmedBy = (s: number[], v: Vars): boolean =>
      v.kind === "push" && s.includes(v.n);
    const sameTarget = (a: Vars, b: Vars): boolean => a.n === b.n;
    pending = confirmPass(pending, [1, 2], { isConfirmedBy, sameTarget });
    expect(pending.map((o) => o.opId)).toEqual(["b"]);

    // the push moved base forward to [1,2]; b still replays on top
    expect(replay([1, 2], pending, applyNums)).toEqual([1, 2, 3]);
  });
});
