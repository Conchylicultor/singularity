/**
 * Tests for the blank-rung ledger.
 *
 * Every rule here defends the same claim: "renders nothing" is a fact about an
 * occupant AND a rung, and the ladder the bar offers is the declared one cut
 * short at the first rung the occupant vanishes on — so the bar can never put a
 * widget where it renders nothing, and therefore can never un-place it for
 * having rendered nothing.
 */

import { describe, expect, test } from "bun:test";
import {
  clearAbsentRungs,
  isAbsentRung,
  markAbsentRung,
  noAbsentRungs,
  offeredRungCount,
} from "./absent-rungs";

describe("markAbsentRung", () => {
  test("records the fact at the rung it was observed at, for that item alone", () => {
    const a = markAbsentRung(noAbsentRungs, "chip", 1);
    expect(isAbsentRung(a, "chip", 1)).toBe(true);
    expect(isAbsentRung(a, "chip", 0)).toBe(false);
    expect(isAbsentRung(a, "other", 1)).toBe(false);
  });

  test("keeps every rung it has learned about one item", () => {
    let a = markAbsentRung(noAbsentRungs, "chip", 2);
    a = markAbsentRung(a, "chip", 1);
    expect(isAbsentRung(a, "chip", 1)).toBe(true);
    expect(isAbsentRung(a, "chip", 2)).toBe(true);
  });

  test("returns the same ledger when it already knew", () => {
    const a = markAbsentRung(noAbsentRungs, "chip", 1);
    expect(markAbsentRung(a, "chip", 1)).toBe(a);
  });

  test("does not mutate the ledger it was handed", () => {
    const before = markAbsentRung(noAbsentRungs, "chip", 1);
    const after = markAbsentRung(before, "chip", 0);
    expect(isAbsentRung(before, "chip", 0)).toBe(false);
    expect(isAbsentRung(after, "chip", 0)).toBe(true);
  });

  test("a rung that is not a rung records nothing rather than throwing", () => {
    // Called from the layout path: the remedy for a bad number is to learn
    // nothing from it, not to take the pane down.
    expect(markAbsentRung(noAbsentRungs, "chip", -1)).toBe(noAbsentRungs);
    expect(markAbsentRung(noAbsentRungs, "chip", 1.5)).toBe(noAbsentRungs);
    expect(markAbsentRung(noAbsentRungs, "chip", Number.NaN)).toBe(
      noAbsentRungs,
    );
  });
});

describe("offeredRungCount", () => {
  test("offers the whole declared ladder when nothing is known", () => {
    expect(offeredRungCount(noAbsentRungs, "chip", 2)).toBe(2);
  });

  test("cuts the ladder short at the first blank rung", () => {
    const a = markAbsentRung(noAbsentRungs, "chip", 1);
    // The widget renders as `full` and nothing as `compact`, so `compact` is not
    // a form it has — the bar may only offer it `full`.
    expect(offeredRungCount(a, "chip", 2)).toBe(1);
  });

  test("blank at its widest rung means no rungs at all — not an occupant", () => {
    const a = markAbsentRung(noAbsentRungs, "chip", 0);
    expect(offeredRungCount(a, "chip", 2)).toBe(0);
  });

  test("a blank rung the declared ladder no longer reaches costs nothing", () => {
    // The widget shortened its own ladder. The blank rung is now out of range,
    // and a fact about a rung that does not exist must not shorten the ladder
    // that does.
    const a = markAbsentRung(noAbsentRungs, "chip", 2);
    expect(offeredRungCount(a, "chip", 2)).toBe(2);
  });
});

describe("clearAbsentRungs", () => {
  test("drops everything known about one item and nothing about the others", () => {
    let a = markAbsentRung(noAbsentRungs, "chip", 1);
    a = markAbsentRung(a, "button", 1);
    const cleared = clearAbsentRungs(a, "chip");
    expect(offeredRungCount(cleared, "chip", 2)).toBe(2);
    expect(offeredRungCount(cleared, "button", 2)).toBe(1);
  });

  test("returns the same ledger when there was nothing to drop", () => {
    const a = markAbsentRung(noAbsentRungs, "chip", 1);
    expect(clearAbsentRungs(a, "button")).toBe(a);
  });
});
