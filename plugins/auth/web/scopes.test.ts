import { test, expect } from "bun:test";
import { missingScopes, mergeScopes } from "./scopes";

test("missingScopes: granted undefined returns all (deduped)", () => {
  expect(missingScopes(["a", "b"], undefined)).toEqual(["a", "b"]);
});

test("missingScopes: granted empty returns all", () => {
  expect(missingScopes(["a", "b"], [])).toEqual(["a", "b"]);
});

test("missingScopes: full subset granted returns []", () => {
  expect(missingScopes(["a", "b"], ["a", "b"])).toEqual([]);
});

test("missingScopes: partial overlap returns the missing in original order", () => {
  expect(missingScopes(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
});

test("missingScopes: duplicates in required are deduped", () => {
  expect(missingScopes(["a", "a", "b", "b"], [])).toEqual(["a", "b"]);
});

test("missingScopes: granted superset returns []", () => {
  expect(missingScopes(["a"], ["a", "b", "c"])).toEqual([]);
});

test("mergeScopes: dedupes and preserves order", () => {
  expect(mergeScopes(["a", "b"], ["b", "c"], ["a", "d"])).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
});

test("mergeScopes: skips undefined inputs", () => {
  expect(mergeScopes(undefined, ["a"], undefined, ["b", "a"])).toEqual([
    "a",
    "b",
  ]);
});

test("mergeScopes: no inputs returns []", () => {
  expect(mergeScopes()).toEqual([]);
  expect(mergeScopes(undefined)).toEqual([]);
  expect(mergeScopes([])).toEqual([]);
});

test("invariant: after merging the missing into granted, nothing is missing", () => {
  const cases: [string[], string[] | undefined][] = [
    [["a", "b", "c"], ["b"]],
    [["a", "b"], undefined],
    [["x"], []],
    [["a", "a", "b"], ["a"]],
  ];
  for (const [req, granted] of cases) {
    const merged = mergeScopes(granted, missingScopes(req, granted));
    expect(missingScopes(req, merged)).toEqual([]);
  }
});
