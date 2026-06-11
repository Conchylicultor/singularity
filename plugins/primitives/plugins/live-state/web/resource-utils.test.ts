/**
 * Tests for the pure readiness combinator. Run with
 * `bun test plugins/primitives/plugins/live-state/`.
 *
 * `useCombinedResources` / `<ResourceView>` are thin shells over this; testing
 * the pure function locks the load-bearing invariants: all-or-nothing pending,
 * per-key data mapping, first-error propagation, and acceptance of the
 * `useOptimisticResource` `{ data, pending }` shape.
 */

import { test, expect, describe } from "bun:test";
import { combineResources } from "./resource-utils";

const settled = <T,>(data: T) => ({ pending: false as const, data, error: null });
const pending = () => ({ pending: true as const, error: null });

describe("combineResources", () => {
  test("pending until every input settled", () => {
    expect(combineResources({ a: settled([1]), b: pending() }).pending).toBe(true);
    expect(combineResources({ a: pending(), b: pending() }).pending).toBe(true);
  });

  test("settles with per-key data once all inputs settled", () => {
    const r = combineResources({ a: settled([1, 2]), b: settled("x") });
    expect(r.pending).toBe(false);
    if (r.pending) throw new Error("unreachable");
    expect(r.data.a).toEqual([1, 2]);
    expect(r.data.b).toBe("x");
  });

  test("accepts the optimistic { data, pending } shape (no discriminated union)", () => {
    const optimistic = { data: { ranks: [] }, pending: false };
    const r = combineResources({ q: optimistic, other: settled(0) });
    expect(r.pending).toBe(false);
    if (r.pending) throw new Error("unreachable");
    expect(r.data.q).toEqual({ ranks: [] });
  });

  test("propagates the first non-null error in both states", () => {
    const err = new Error("boom");
    const failedPending = { pending: true as const, error: err };
    expect(combineResources({ a: failedPending, b: pending() }).error).toBe(err);
    const failedSettled = { pending: false as const, data: 1, error: err };
    const r = combineResources({ a: failedSettled, b: settled(2) });
    expect(r.error).toBe(err);
    expect(r.pending).toBe(false);
  });

  test("empty input set is settled", () => {
    const r = combineResources({});
    expect(r.pending).toBe(false);
  });
});
