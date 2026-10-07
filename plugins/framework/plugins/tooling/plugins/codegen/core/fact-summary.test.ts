import { describe, expect, test } from "bun:test";
import type { DocFact } from "@plugins/plugin-meta/plugins/facets/core";
import {
  DOC_LIST_MAX,
  isSummarized,
  summaryCount,
  summaryLines,
} from "./fact-summary";

const values = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}/${i}`);

const grouped = (sizes: Record<string, number>): DocFact => ({
  folder: "cross-plugin",
  key: "Imported by",
  noun: "plugins",
  groups: Object.entries(sizes).map(([label, n]) => ({
    label,
    values: values(label, n),
  })),
});

describe("isSummarized", () => {
  test("a grouped fact at the cap prints in full", () => {
    expect(isSummarized(grouped({ a: DOC_LIST_MAX }))).toBe(false);
  });
  test("a grouped fact past the cap is summarized", () => {
    expect(isSummarized(grouped({ a: DOC_LIST_MAX, b: 1 }))).toBe(true);
  });
  test("a flat fact is never summarized", () => {
    const flat: DocFact = {
      folder: "web",
      key: "Exports (values)",
      values: values("x", DOC_LIST_MAX * 3),
    };
    expect(isSummarized(flat)).toBe(false);
  });
});

describe("summaryLines", () => {
  test("largest group first, ties by label, a singleton shows its value", () => {
    const fact = grouped({ zeta: 1, beta: 5, alpha: 5, gamma: 12 });
    if (!isSummarized(fact)) throw new Error("expected a summarized fact");
    expect(summaryLines(fact)).toEqual([
      "gamma ×12",
      "alpha ×5",
      "beta ×5",
      "zeta/0",
    ]);
    expect(summaryCount(fact)).toBe("23 plugins");
  });
});
