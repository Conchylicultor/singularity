/**
 * Tests for the H2 ledger.
 *
 * Every rule here defends the same claim: a bar is evidence about ONE item at
 * ONE rung, gathered at ONE width — so recording a second one may never lose
 * the first, and a bar may never outlive the condition it stated.
 */

import { describe, expect, test } from "bun:test";
import {
  barRung,
  emptyBlockedRungs,
  isBarred,
  sweepBarred,
  unbarItem,
} from "./blocked-rungs";

const HYST = 8;

describe("barRung", () => {
  test("records a rejection at the rung it was measured at", () => {
    const b = barRung(emptyBlockedRungs, "a", 1, 300);
    expect(isBarred(b, "a", 1, 300, HYST)).toBe(true);
    expect(isBarred(b, "other", 1, 300, HYST)).toBe(false);
  });

  test("keeps the WIDEST width per (item, rung)", () => {
    let b = barRung(emptyBlockedRungs, "a", 0, 500);
    b = barRung(b, "a", 0, 300);
    // The 300px rejection must not discharge the 500px one: at 400 the row has
    // beaten the narrower rejection and not the wider one.
    expect(isBarred(b, "a", 0, 400, HYST)).toBe(true);
    expect(isBarred(b, "a", 0, 509, HYST)).toBe(false);
  });

  test("returns the same ledger when the stored width already covers it", () => {
    const b = barRung(emptyBlockedRungs, "a", 0, 500);
    expect(barRung(b, "a", 0, 500)).toBe(b);
    expect(barRung(b, "a", 0, 200)).toBe(b);
  });

  test("does not mutate the ledger it was handed", () => {
    const before = barRung(emptyBlockedRungs, "a", 0, 500);
    const after = barRung(before, "a", 1, 300);
    expect(isBarred(before, "a", 1, 1000, HYST)).toBe(false);
    expect(isBarred(after, "a", 1, 305, HYST)).toBe(true);
  });

  test("a width that is not a width records nothing rather than throwing", () => {
    // Called from the layout path: the remedy for a bad number is to learn
    // nothing from it, never to take the pane down.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(barRung(emptyBlockedRungs, "a", 0, bad)).toBe(emptyBlockedRungs);
    }
  });
});

describe("isBarred — the monotone implication", () => {
  // Rung 0 is the WIDEST form, so a rejection at rung 1 is a rejection at
  // rung 0: promoting past the rung the row just learned does not fit would be
  // promoting into something even wider.
  const barredAtOne = barRung(emptyBlockedRungs, "a", 1, 500);

  test("barring a narrow rung also bars every wider one", () => {
    expect(isBarred(barredAtOne, "a", 1, 400, HYST)).toBe(true);
    expect(isBarred(barredAtOne, "a", 0, 400, HYST)).toBe(true);
  });

  test("and bars nothing NARROWER — that direction is not implied", () => {
    expect(isBarred(barredAtOne, "a", 2, 400, HYST)).toBe(false);
  });

  test("a second, narrower bar cannot free the wider one it was recorded beside", () => {
    // The 500/300/400 scenario: rung 0 rejected at 500, the row shrinks, rung 1
    // rejected at 300. At 400 the row has beaten neither the rung-0 rejection
    // nor the implication it carries.
    let b = barRung(emptyBlockedRungs, "a", 0, 500);
    b = barRung(b, "a", 1, 300);
    expect(isBarred(b, "a", 0, 400, HYST)).toBe(true);
    // Rung 1's own rejection IS discharged at 400 — it said "until 308".
    expect(isBarred(b, "a", 1, 400, HYST)).toBe(false);
  });

  test("an item with no bars at all is never barred", () => {
    expect(isBarred(emptyBlockedRungs, "a", 0, 0, HYST)).toBe(false);
  });
});

describe("isBarred — the release boundary", () => {
  const b = barRung(emptyBlockedRungs, "a", 0, 200);

  test("released strictly past atWidth + hysteresis, and not one pixel before", () => {
    expect(isBarred(b, "a", 0, 208, HYST)).toBe(true);
    expect(isBarred(b, "a", 0, 209, HYST)).toBe(false);
  });

  test("the same width that rejected the rung never re-admits it", () => {
    expect(isBarred(b, "a", 0, 200, HYST)).toBe(true);
  });
});

describe("sweepBarred", () => {
  test("drops a bar the row has genuinely beaten", () => {
    const b = barRung(emptyBlockedRungs, "a", 0, 200);
    const swept = sweepBarred(b, 209, HYST);
    expect(isBarred(swept, "a", 0, 0, HYST)).toBe(false);
  });

  test("keeps a bar the row has not beaten — the same predicate isBarred reads", () => {
    const b = barRung(emptyBlockedRungs, "a", 0, 200);
    expect(sweepBarred(b, 208, HYST)).toBe(b);
  });

  test("sweeps rung by rung, not item by item", () => {
    let b = barRung(emptyBlockedRungs, "a", 0, 500);
    b = barRung(b, "a", 1, 300);
    const swept = sweepBarred(b, 400, HYST);
    expect(isBarred(swept, "a", 0, 400, HYST)).toBe(true);
    // Rung 1's bar is gone for good now, not merely dormant.
    expect(isBarred(swept, "a", 1, 0, HYST)).toBe(false);
  });

  test("an item left with no bars leaves the ledger entirely", () => {
    let b = barRung(emptyBlockedRungs, "a", 0, 100);
    b = barRung(b, "b", 0, 500);
    const swept = sweepBarred(b, 200, HYST);
    expect([...swept.keys()]).toEqual(["b"]);
  });

  test("returns the same ledger when nothing was dropped", () => {
    const b = barRung(emptyBlockedRungs, "a", 0, 500);
    expect(sweepBarred(b, 100, HYST)).toBe(b);
    expect(sweepBarred(emptyBlockedRungs, 10_000, HYST)).toBe(
      emptyBlockedRungs,
    );
  });
});

describe("unbarItem", () => {
  test("forgets every rung of one item and nothing else", () => {
    let b = barRung(emptyBlockedRungs, "a", 0, 500);
    b = barRung(b, "a", 1, 500);
    b = barRung(b, "b", 0, 500);
    const dropped = unbarItem(b, "a");
    expect(isBarred(dropped, "a", 0, 0, HYST)).toBe(false);
    expect(isBarred(dropped, "a", 1, 0, HYST)).toBe(false);
    expect(isBarred(dropped, "b", 0, 0, HYST)).toBe(true);
  });

  test("returns the same ledger when there was nothing to forget", () => {
    const b = barRung(emptyBlockedRungs, "a", 0, 500);
    expect(unbarItem(b, "nope")).toBe(b);
  });
});
