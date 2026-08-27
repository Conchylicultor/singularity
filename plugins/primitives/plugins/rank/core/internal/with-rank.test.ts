import { describe, expect, test } from "bun:test";
import { Rank } from "./rank";
import { withRank } from "./with-rank";

describe("withRank", () => {
  test("wraps the raw key in a Rank value object", () => {
    const out = withRank({ rank: "a0" });
    expect(out.rank).toBeInstanceOf(Rank);
    expect(Rank.equals(out.rank, Rank.from("a0"))).toBe(true);
  });

  test("passes every other field through untouched", () => {
    const data = { nested: true };
    const out = withRank({ id: "t1", count: 3, data, rank: "a1" });
    expect(out.id).toBe("t1");
    expect(out.count).toBe(3);
    expect(out.data).toBe(data);
  });

  test("does not mutate the input row", () => {
    const row = { id: "t1", rank: "a2" };
    const out = withRank(row);
    expect(row.rank).toBe("a2");
    expect(out).not.toBe(row);
  });
});
