import { describe, expect, it } from "bun:test";
import { linearScale, niceStep, niceTicks } from "./scale";

describe("niceStep", () => {
  it("rounds up to 1 / 2 / 2.5 / 5 / 10 times a power of ten", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(180)).toBe(200);
  });

  it("throws on a span with no step", () => {
    expect(() => niceStep(0)).toThrow(/positive finite/);
    expect(() => niceStep(-1)).toThrow(/positive finite/);
    expect(() => niceStep(Number.NaN)).toThrow(/positive finite/);
  });
});

describe("niceTicks", () => {
  it("covers the domain with round ticks", () => {
    expect(niceTicks(0, 37)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0, 1000)).toEqual([0, 250, 500, 750, 1000]);
  });

  it("spans a signed domain through zero", () => {
    const ticks = niceTicks(-12, 30);
    expect(ticks[0]).toBeLessThanOrEqual(-12);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(30);
    expect(ticks).toContain(0);
  });

  it("widens an empty span so the axis still has a scale", () => {
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("has no float drift", () => {
    for (const t of niceTicks(0, 0.3, 3))
      expect(String(t).length).toBeLessThan(6);
  });

  it("never yields -0", () => {
    expect(Object.is(niceTicks(-5, 5)[1], -0)).toBe(false);
    expect(niceTicks(-5, 5).some((t) => Object.is(t, -0))).toBe(false);
  });

  it("throws on an inverted or non-finite domain", () => {
    expect(() => niceTicks(5, 1)).toThrow(/invalid domain/);
    expect(() => niceTicks(0, Number.POSITIVE_INFINITY)).toThrow(
      /invalid domain/,
    );
  });
});

describe("linearScale", () => {
  it("maps domain onto range, inverted ranges included", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });

  it("maps a zero-width domain to the range start", () => {
    expect(linearScale([3, 3], [10, 20])(3)).toBe(10);
  });
});
