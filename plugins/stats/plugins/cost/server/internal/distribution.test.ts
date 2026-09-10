import { describe, expect, test } from "bun:test";
import { logCostBuckets } from "./distribution";

describe("logCostBuckets", () => {
  test("no conversations → no buckets", () => {
    expect(logCostBuckets([])).toEqual([]);
  });

  test("spans the 1-2-5 ladder from the edge at or below min to the edge above max", () => {
    expect(logCostBuckets([0.03, 0.7, 3, 140])).toEqual([
      { label: "$0.02–0.05", count: 1 },
      { label: "$0.05–0.1", count: 0 },
      { label: "$0.1–0.2", count: 0 },
      { label: "$0.2–0.5", count: 0 },
      { label: "$0.5–1", count: 1 },
      { label: "$1–2", count: 0 },
      { label: "$2–5", count: 1 },
      { label: "$5–10", count: 0 },
      { label: "$10–20", count: 0 },
      { label: "$20–50", count: 0 },
      { label: "$50–100", count: 0 },
      { label: "$100–200", count: 1 },
    ]);
  });

  test("an edge value falls in the bucket it opens", () => {
    expect(logCostBuckets([1, 2, 5])).toEqual([
      { label: "$1–2", count: 1 },
      { label: "$2–5", count: 1 },
      { label: "$5–10", count: 1 },
    ]);
  });

  test("sub-cent and $0 conversations share one leading bucket", () => {
    expect(logCostBuckets([0, 0.004, 1.5])).toEqual([
      { label: "< $0.01", count: 2 },
      { label: "$1–2", count: 1 },
    ]);
    expect(logCostBuckets([0, 0])).toEqual([{ label: "< $0.01", count: 2 }]);
  });

  test("thousands are abbreviated", () => {
    expect(logCostBuckets([999.99, 1200]).map((b) => b.label)).toEqual([
      "$500–1k",
      "$1k–2k",
    ]);
  });
});
