/**
 * Tests for the width ledger.
 *
 * The rules all defend the same fragile fact: an item is only measurable at the
 * rung it is currently rendering, inline. Everything else is inference, and the
 * ledger must never let inference pass for measurement.
 */

import { describe, expect, test } from "bun:test";
import {
  dropItem,
  emptyWidthCache,
  estimate,
  inlineWidthsFor,
  staleOthers,
  widthKey,
  widthKeyItemId,
  write,
  type WidthCache,
} from "./width-cache";

function put(
  cache: WidthCache,
  id: string,
  rung: number,
  px: number,
): WidthCache {
  const r = write(cache, { id, rung, px, dockedInline: true });
  expect(r.ok).toBe(true);
  return r.cache;
}

describe("write", () => {
  test("stores an inline measurement as exact", () => {
    const cache = put(emptyWidthCache, "a", 0, 120);
    expect(cache.get(widthKey("a", 0))).toEqual({ px: 120, exact: true });
  });

  test("refuses a 0 — that is an absent contribution, not a widget of width 0", () => {
    const r = write(emptyWidthCache, {
      id: "a",
      rung: 0,
      px: 0,
      dockedInline: true,
    });
    expect(r).toEqual({
      ok: false,
      reason: "rendered-nothing",
      cache: emptyWidthCache,
    });
  });

  test("refuses a width read while the item sat in the panel", () => {
    const r = write(emptyWidthCache, {
      id: "a",
      rung: 0,
      px: 120,
      dockedInline: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-inline");
    expect(r.cache.size).toBe(0);
  });

  test("refuses a value that is not a width at all", () => {
    for (const px of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = write(emptyWidthCache, {
        id: "a",
        rung: 0,
        px,
        dockedInline: true,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not-a-width");
    }
  });

  test("a refusal leaves an existing measurement alone", () => {
    const cache = put(emptyWidthCache, "a", 0, 120);
    const r = write(cache, { id: "a", rung: 0, px: 0, dockedInline: true });
    expect(r.cache.get(widthKey("a", 0))).toEqual({ px: 120, exact: true });
  });

  test("does not mutate the cache it was handed", () => {
    const before = put(emptyWidthCache, "a", 0, 120);
    const after = put(before, "a", 1, 60);
    expect(before.has(widthKey("a", 1))).toBe(false);
    expect(after.has(widthKey("a", 1))).toBe(true);
  });
});

describe("staleOthers", () => {
  test("keeps the other rungs' values but drops the exact claim", () => {
    let cache = put(emptyWidthCache, "a", 0, 120);
    cache = put(cache, "a", 1, 60);
    cache = staleOthers(cache, "a", 1);
    expect(cache.get(widthKey("a", 1))).toEqual({ px: 60, exact: true });
    // Kept as an estimate, NOT deleted: rung 0 is unmeasurable while the item
    // renders at rung 1, so deleting it would strand the item there forever.
    expect(cache.get(widthKey("a", 0))).toEqual({ px: 120, exact: false });
  });

  test("touches no other item", () => {
    let cache = put(emptyWidthCache, "a", 0, 120);
    cache = put(cache, "b", 0, 80);
    cache = staleOthers(cache, "a", 1);
    expect(cache.get(widthKey("b", 0))).toEqual({ px: 80, exact: true });
  });

  test("an id containing a space is not confused with a neighbour", () => {
    let cache = put(emptyWidthCache, "a 1", 0, 120);
    cache = put(cache, "a", 1, 60);
    cache = staleOthers(cache, "a", 0);
    expect(cache.get(widthKey("a 1", 0))).toEqual({ px: 120, exact: true });
    expect(cache.get(widthKey("a", 1))).toEqual({ px: 60, exact: false });
  });
});

describe("dropItem", () => {
  test("removes every rung of one item and nothing else", () => {
    let cache = put(emptyWidthCache, "a", 0, 120);
    cache = put(cache, "a", 1, 60);
    cache = put(cache, "a 1", 0, 999);
    cache = put(cache, "b", 0, 80);
    cache = dropItem(cache, "a");
    expect(cache.has(widthKey("a", 0))).toBe(false);
    expect(cache.has(widthKey("a", 1))).toBe(false);
    expect(cache.get(widthKey("a 1", 0))).toEqual({ px: 999, exact: true });
    expect(cache.get(widthKey("b", 0))).toEqual({ px: 80, exact: true });
  });

  test("returns the same cache when there was nothing to drop", () => {
    const cache = put(emptyWidthCache, "a", 0, 120);
    expect(dropItem(cache, "nope")).toBe(cache);
  });
});

describe("widthKeyItemId", () => {
  test("splits at the last space so an id may contain spaces", () => {
    expect(widthKeyItemId(widthKey("a b c", 12))).toBe("a b c");
  });

  test("a malformed key throws rather than inventing an id", () => {
    expect(() => widthKeyItemId("nope")).toThrow(/malformed width-cache key/);
  });
});

describe("estimate", () => {
  test("reports a measurement as exact", () => {
    const cache = put(emptyWidthCache, "a", 1, 60);
    expect(estimate(cache, "a", 1)).toEqual({ kind: "exact", px: 60 });
  });

  test("falls back to the nearest WIDER rung — the only sound bound", () => {
    const cache = put(emptyWidthCache, "a", 0, 120);
    expect(estimate(cache, "a", 2)).toEqual({
      kind: "estimate",
      px: 120,
      fromRung: 0,
    });
  });

  test("prefers the closest wider rung", () => {
    let cache = put(emptyWidthCache, "a", 0, 120);
    cache = put(cache, "a", 1, 60);
    expect(estimate(cache, "a", 2)).toEqual({
      kind: "estimate",
      px: 60,
      fromRung: 1,
    });
  });

  test("never borrows from a NARROWER rung — that is a lower bound, and a lower bound fabricates fits", () => {
    const cache = put(emptyWidthCache, "a", 2, 20);
    expect(estimate(cache, "a", 0)).toEqual({ kind: "unknown" });
  });

  test("a staled entry at the rung itself is an estimate, not a measurement", () => {
    let cache = put(emptyWidthCache, "a", 0, 120);
    cache = put(cache, "a", 1, 60);
    cache = staleOthers(cache, "a", 1);
    expect(estimate(cache, "a", 0)).toEqual({
      kind: "estimate",
      px: 120,
      fromRung: 0,
    });
  });

  test("nothing known at all is unknown, never 0", () => {
    expect(estimate(emptyWidthCache, "a", 0)).toEqual({ kind: "unknown" });
  });
});

describe("inlineWidthsFor", () => {
  test("hands `assign` measurements only, leaving the guessing to the fit math", () => {
    let cache = put(emptyWidthCache, "a", 0, 120);
    cache = put(cache, "a", 1, 60);
    cache = staleOthers(cache, "a", 0);
    // Rung 1 is now hearsay, so it arrives as `undefined` and `assign` re-derives
    // the same monotone bound itself — a substituted number would be
    // indistinguishable from a real measurement, and that distinction is what
    // decides whether a fit can be trusted.
    expect(inlineWidthsFor(cache, "a", 3)).toEqual([120, undefined, undefined]);
  });

  test("an unknown item yields a ladder of unknowns, not zeros", () => {
    expect(inlineWidthsFor(emptyWidthCache, "ghost", 2)).toEqual([
      undefined,
      undefined,
    ]);
  });
});
