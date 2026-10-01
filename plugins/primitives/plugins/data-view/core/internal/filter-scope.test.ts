import { describe, expect, test } from "bun:test";
import { scopeFilterRows } from "./filter-scope";

interface R {
  id: string;
  parent: string | null;
  tag: string;
}

// a (user) ─ a1 (agent) ─ a11 (user)
// b (agent) ─ b1 (user)
// c (user)
const ROWS: R[] = [
  { id: "a", parent: null, tag: "user" },
  { id: "a1", parent: "a", tag: "agent" },
  { id: "a11", parent: "a1", tag: "user" },
  { id: "b", parent: null, tag: "agent" },
  { id: "b1", parent: "b", tag: "user" },
  { id: "c", parent: null, tag: "user" },
];

const by = (tag: string) => ({
  key: (r: R) => r.id,
  parentOf: (r: R) => r.parent,
  matches: (r: R) => r.tag === tag,
});
const ids = (rows: readonly R[]) => rows.map((r) => r.id);

describe("scopeFilterRows — roots", () => {
  test("a kept root keeps its whole subtree, whatever the descendants hold", () => {
    expect(ids(scopeFilterRows(ROWS, "roots", by("user")))).toEqual([
      "a",
      "a1",
      "a11",
      "c",
    ]);
  });

  test("pulls in no ancestor of a matching descendant", () => {
    // a1 is agent, but its root `a` is not — so nothing of `a` survives.
    expect(ids(scopeFilterRows(ROWS, "roots", by("agent")))).toEqual([
      "b",
      "b1",
    ]);
  });

  test("an orphan (parent absent from the set) is a root", () => {
    const rows: R[] = [{ id: "x", parent: "gone", tag: "agent" }];
    expect(ids(scopeFilterRows(rows, "roots", by("agent")))).toEqual(["x"]);
  });

  test("a parent cycle terminates", () => {
    const rows: R[] = [
      { id: "p", parent: "q", tag: "agent" },
      { id: "q", parent: "p", tag: "user" },
    ];
    expect(() => scopeFilterRows(rows, "roots", by("agent"))).not.toThrow();
  });

  test("returns the same array when everything survives", () => {
    const all = { ...by("user"), matches: () => true };
    expect(scopeFilterRows(ROWS, "roots", all)).toBe(ROWS);
  });
});

describe("scopeFilterRows — rows", () => {
  test("keeps matches plus their ancestor chain", () => {
    expect(ids(scopeFilterRows(ROWS, "rows", by("agent")))).toEqual([
      "a",
      "a1",
      "b",
    ]);
  });
});
