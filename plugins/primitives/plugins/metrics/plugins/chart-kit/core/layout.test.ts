import { describe, expect, it } from "bun:test";
import {
  CATEGORICAL_SLOTS,
  assertChartShape,
  categoricalColor,
  colorSeries,
  foldSeries,
  stackSegments,
  stackTotal,
  valueDomain,
} from "./layout";
import type { ChartSeries } from "./types";

const s = (key: string, values: (number | null)[]): ChartSeries => ({
  key,
  label: key,
  values,
});

describe("colours", () => {
  it("assigns categorical slots in fixed order, keeping explicit colours", () => {
    const out = colorSeries([
      s("a", [1]),
      { ...s("b", [1]), color: "red" },
      s("c", [1]),
    ]);
    expect(out.map((x) => x.color)).toEqual([
      "var(--categorical-1)",
      "red",
      "var(--categorical-3)",
    ]);
  });

  it("never cycles past the last slot", () => {
    expect(categoricalColor(CATEGORICAL_SLOTS - 1)).toBe(
      "var(--categorical-10)",
    );
    expect(() => categoricalColor(CATEGORICAL_SLOTS)).toThrow(/foldSeries/);
  });
});

describe("foldSeries", () => {
  it("leaves up to the slot count untouched", () => {
    const ten = Array.from({ length: 10 }, (_, i) => s(`s${i}`, [i]));
    expect(foldSeries(ten)).toEqual(ten);
  });

  it("folds the tail into one Other series on the last slot", () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      s(`s${i}`, [1, i === 11 ? null : 2]),
    );
    const out = foldSeries(twelve);
    expect(out).toHaveLength(CATEGORICAL_SLOTS);
    const other = out.at(-1)!;
    expect(other.label).toBe("Other (3)");
    // s9 + s10 + s11 = 3; s11 is null at bucket 1 → the fold is null there.
    expect(other.values).toEqual([3, null]);
  });
});

describe("assertChartShape", () => {
  it("rejects mismatched lengths", () => {
    expect(() => assertChartShape("line", 3, [s("a", [1, 2])], null)).toThrow(
      /2 values for 3/,
    );
    expect(() =>
      assertChartShape("line", 2, [s("a", [1, 2])], {
        label: "prev",
        values: [1],
      }),
    ).toThrow(/compare/);
  });

  it("enforces each kind's series count", () => {
    expect(() => assertChartShape("mirror", 1, [s("a", [1])], null)).toThrow(
      /exactly 2/,
    );
    expect(() =>
      assertChartShape("net", 1, [s("a", [1]), s("b", [1])], null),
    ).toThrow(/exactly 1/);
    expect(() => assertChartShape("stack", 1, [], null)).toThrow(
      /at least one/,
    );
  });
});

describe("stack", () => {
  const series = [s("a", [2, 0, null]), s("b", [3, 4, null])];

  it("stacks positive values bottom-up, rounding only the top", () => {
    expect(stackSegments(series, 0)).toEqual([
      { key: "a", index: 0, from: 0, to: 2, top: false },
      { key: "b", index: 1, from: 2, to: 5, top: true },
    ]);
    // A zero segment draws nothing; the one left is the top.
    expect(stackSegments(series, 1)).toEqual([
      { key: "b", index: 1, from: 0, to: 4, top: true },
    ]);
    expect(stackSegments(series, 2)).toEqual([]);
  });

  it("throws on a negative value", () => {
    expect(() => stackSegments([s("a", [-1])], 0)).toThrow(/negative/);
  });

  it("totals a column, null when nothing is covered", () => {
    expect(stackTotal(series, 0)).toBe(5);
    expect(stackTotal(series, 2)).toBeNull();
  });
});

describe("valueDomain", () => {
  it("stack: 0 … the tallest column", () => {
    const series = [s("a", [2, 1]), s("b", [3, 8])];
    expect(valueDomain("stack", 2, series, null)).toEqual({ lo: 0, hi: 9 });
  });

  it("mirror: the second series goes below zero", () => {
    const series = [s("up", [5, 2]), s("down", [3, 7])];
    expect(valueDomain("mirror", 2, series, null)).toEqual({ lo: -7, hi: 5 });
  });

  it("net / line: min and max, always including zero", () => {
    expect(valueDomain("net", 3, [s("n", [4, -6, null])], null)).toEqual({
      lo: -6,
      hi: 4,
    });
    expect(valueDomain("line", 2, [s("l", [10, 12])], null)).toEqual({
      lo: 0,
      hi: 12,
    });
  });

  it("the compare line widens the range", () => {
    expect(
      valueDomain("line", 2, [s("l", [1, 2])], {
        label: "prev",
        values: [9, null],
      }),
    ).toEqual({ lo: 0, hi: 9 });
  });

  it("all-null and empty are [0, 0]", () => {
    expect(valueDomain("area", 2, [s("l", [null, null])], null)).toEqual({
      lo: 0,
      hi: 0,
    });
    expect(valueDomain("stack", 0, [s("l", [])], null)).toEqual({
      lo: 0,
      hi: 0,
    });
  });
});
