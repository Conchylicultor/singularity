import { describe, expect, test } from "bun:test";
import { OTHER_VARIANT, VARIANT_CAP } from "../../core";
import { mergeMeasures, mergeVariant } from "./merge-detail";

describe("mergeVariant", () => {
  test("bumps an existing variant and appends a new one", () => {
    let v = mergeVariant([], "a", 10);
    v = mergeVariant(v, "a", 30);
    v = mergeVariant(v, "b", 5);
    expect(v).toEqual([
      { variant: "a", count: 2, totalMs: 40, maxMs: 30 },
      { variant: "b", count: 1, totalMs: 5, maxMs: 5 },
    ]);
  });

  test("keeps the top VARIANT_CAP by total and folds the rest into (other)", () => {
    let v: ReturnType<typeof mergeVariant> = [];
    for (let i = 0; i < VARIANT_CAP; i++) v = mergeVariant(v, `v${i}`, 100 + i);
    v = mergeVariant(v, "small", 1);
    v = mergeVariant(v, "small2", 2);

    expect(v).toHaveLength(VARIANT_CAP + 1);
    const other = v.find((x) => x.variant === OTHER_VARIANT)!;
    expect(other).toEqual({
      variant: OTHER_VARIANT,
      count: 2,
      totalMs: 3,
      maxMs: 2,
    });
    expect(v.some((x) => x.variant === "small")).toBe(false);
  });

  test("a folded-away variant whose total climbs back re-enters, displacing the smallest", () => {
    let v: ReturnType<typeof mergeVariant> = [];
    for (let i = 0; i < VARIANT_CAP; i++) v = mergeVariant(v, `v${i}`, 10);
    v = mergeVariant(v, "big", 1_000);
    expect(v.some((x) => x.variant === "big")).toBe(true);
    expect(v.filter((x) => x.variant !== OTHER_VARIANT)).toHaveLength(
      VARIANT_CAP,
    );
    expect(v.find((x) => x.variant === OTHER_VARIANT)!.count).toBe(1);
  });
});

describe("mergeMeasures", () => {
  test("tracks each measure's max and latest value", () => {
    let m = mergeMeasures({}, { subscribers: 5, frameChars: 100 });
    m = mergeMeasures(m, { subscribers: 2 });
    expect(m).toEqual({
      subscribers: { max: 5, last: 2 },
      frameChars: { max: 100, last: 100 },
    });
  });
});
