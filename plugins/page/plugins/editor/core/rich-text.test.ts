/**
 * Pure unit tests for the structured runs model (`rich-text.ts`).
 * Run with `bun test plugins/page/plugins/editor/core/rich-text.test.ts`.
 */

import { test, expect, describe } from "bun:test";
import {
  coalesce,
  mergeRuns,
  plainOf,
  runsLength,
  runsOf,
  sortMarks,
  splitRuns,
  type RichText,
} from "./rich-text";

describe("runsOf", () => {
  test("non-empty string → single unmarked run", () => {
    expect(runsOf("hello")).toEqual([{ text: "hello" }]);
  });

  test("empty string → []", () => {
    expect(runsOf("")).toEqual([]);
  });

  test("valid array passes through (validated)", () => {
    const runs: RichText = [{ text: "a", marks: ["bold"] }, { text: "b", color: "red" }];
    expect(runsOf(runs)).toEqual(runs);
  });

  test("array with bad members → []", () => {
    expect(runsOf([{ text: "ok" }, { nope: 1 }])).toEqual([]);
  });

  test("garbage → []", () => {
    expect(runsOf(undefined)).toEqual([]);
    expect(runsOf(null)).toEqual([]);
    expect(runsOf(42)).toEqual([]);
    expect(runsOf({ text: "x" })).toEqual([]);
  });

  test("preserves [[pageId]] tokens inside run text", () => {
    expect(runsOf("see [[abc]] here")).toEqual([{ text: "see [[abc]] here" }]);
  });
});

describe("plainOf", () => {
  test("string passes through", () => {
    expect(plainOf("hello")).toBe("hello");
  });

  test("runs concatenate", () => {
    expect(plainOf([{ text: "foo" }, { text: "bar", marks: ["bold"] }])).toBe("foobar");
  });

  test("preserves [[pageId]] tokens verbatim", () => {
    expect(plainOf([{ text: "a [[p1]] " }, { text: "b" }])).toBe("a [[p1]] b");
  });

  test("garbage → empty string", () => {
    expect(plainOf(undefined)).toBe("");
    expect(plainOf(123)).toBe("");
  });
});

describe("runsLength", () => {
  test("sums run text lengths", () => {
    expect(runsLength([{ text: "abc" }, { text: "de", marks: ["italic"] }])).toBe(5);
    expect(runsLength([])).toBe(0);
  });
});

describe("sortMarks", () => {
  test("canonical order + dedupe", () => {
    expect(sortMarks(["italic", "bold", "italic"])).toEqual(["bold", "italic"]);
    expect(sortMarks(["code", "underline", "bold"])).toEqual(["bold", "underline", "code"]);
  });
});

describe("splitRuns", () => {
  test("at the very start", () => {
    const [b, a] = splitRuns([{ text: "hello" }], 0);
    expect(b).toEqual([]);
    expect(a).toEqual([{ text: "hello" }]);
  });

  test("at the very end (clamped)", () => {
    const [b, a] = splitRuns([{ text: "hello" }], 99);
    expect(b).toEqual([{ text: "hello" }]);
    expect(a).toEqual([]);
  });

  test("on a run boundary keeps runs whole", () => {
    const runs: RichText = [{ text: "foo", marks: ["bold"] }, { text: "bar" }];
    const [b, a] = splitRuns(runs, 3);
    expect(b).toEqual([{ text: "foo", marks: ["bold"] }]);
    expect(a).toEqual([{ text: "bar" }]);
  });

  test("mid-run divides into two runs sharing attributes", () => {
    const runs: RichText = [{ text: "helloworld", marks: ["italic"], color: "red", link: "u" }];
    const [b, a] = splitRuns(runs, 5);
    expect(b).toEqual([{ text: "hello", marks: ["italic"], color: "red", link: "u" }]);
    expect(a).toEqual([{ text: "world", marks: ["italic"], color: "red", link: "u" }]);
  });

  test("across multiple marked runs", () => {
    const runs: RichText = [
      { text: "ab", marks: ["bold"] },
      { text: "cd" },
      { text: "ef", color: "blue" },
    ];
    const [b, a] = splitRuns(runs, 3); // ab + c | d + ef
    expect(b).toEqual([{ text: "ab", marks: ["bold"] }, { text: "c" }]);
    expect(a).toEqual([{ text: "d" }, { text: "ef", color: "blue" }]);
  });

  test("normalizes default color / empty marks away", () => {
    const runs: RichText = [{ text: "hi", marks: [], color: "default" }];
    const [b, a] = splitRuns(runs, 1);
    expect(b).toEqual([{ text: "h" }]);
    expect(a).toEqual([{ text: "i" }]);
  });
});

describe("mergeRuns / coalesce", () => {
  test("coalesces adjacent runs with identical attributes", () => {
    const out = mergeRuns([{ text: "foo" }], [{ text: "bar" }]);
    expect(out).toEqual([{ text: "foobar" }]);
  });

  test("does not coalesce differing marks", () => {
    const out = mergeRuns([{ text: "foo", marks: ["bold"] }], [{ text: "bar" }]);
    expect(out).toEqual([{ text: "foo", marks: ["bold"] }, { text: "bar" }]);
  });

  test("coalesces runs whose marks differ only in order", () => {
    const out = coalesce([
      { text: "a", marks: ["bold", "italic"] },
      { text: "b", marks: ["italic", "bold"] },
    ]);
    expect(out).toEqual([{ text: "ab", marks: ["bold", "italic"] }]);
  });

  test("drops empty-text runs", () => {
    expect(coalesce([{ text: "" }, { text: "x" }, { text: "" }])).toEqual([{ text: "x" }]);
  });

  test("color + link participate in the coalesce key", () => {
    const out = coalesce([
      { text: "a", color: "red" },
      { text: "b", color: "red" },
      { text: "c", color: "blue" },
    ]);
    expect(out).toEqual([{ text: "ab", color: "red" }, { text: "c", color: "blue" }]);
  });
});
