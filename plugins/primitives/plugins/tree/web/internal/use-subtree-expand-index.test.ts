/**
 * Tests for the per-row subtree expand index — the pure half of
 * `useSubtreeExpandIndex`, which every tree row with children consults to decide
 * whether its fold button reads "expand" or "collapse", and what a click on it
 * writes.
 *
 * The two rules worth pinning are the ones a reimplementation gets wrong: a leaf
 * is *vacuously* all-expanded (so a folder full of files still reads as fully
 * unfolded), and a flip emits only the rows whose value actually differs (the
 * expand sink re-serializes its whole map per call, so a padded batch is not
 * free).
 */

import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { buildTree, type TreeNode } from "../../core";
import { buildSubtreeExpandIndex } from "./use-subtree-expand-index";

type Row = {
  id: string;
  parentId: string | null;
  rank: Rank;
  expanded: boolean;
};

/**
 * `{ "a!": ["b", "c!"] }` — a parent id mapped to its children, with a trailing
 * `!` on any id that is expanded. A row may be named twice — once as a parent
 * key, once as its own parent's child — and the two mentions are merged: the
 * parent link comes from the child mention, the `!` from either.
 */
function forest(spec: Record<string, string[]>): TreeNode<Row>[] {
  const id = (token: string) => token.replace("!", "");
  const expanded = new Set<string>();
  const parentOf = new Map<string, string | null>();
  const order: string[] = [];

  const note = (token: string, parent: string | null) => {
    const key = id(token);
    if (token.endsWith("!")) expanded.add(key);
    if (!parentOf.has(key)) {
      parentOf.set(key, parent);
      order.push(key);
    } else if (parent !== null) {
      parentOf.set(key, parent);
    }
  };
  for (const [parent, children] of Object.entries(spec)) {
    note(parent, null);
    for (const child of children) note(child, id(parent));
  }

  const rows: Row[] = order.map((key) => ({
    id: key,
    parentId: parentOf.get(key) ?? null,
    rank: Rank.between(null, null),
    expanded: expanded.has(key),
  }));
  return buildTree(rows);
}

describe("buildSubtreeExpandIndex", () => {
  test("a leaf is vacuously all-expanded, and never drags its parent false", () => {
    // `a` is open and holds two leaves. The leaves carry `expanded: false`, but
    // they have nothing to unfold — so the subtree is fully open.
    const index = buildSubtreeExpandIndex(forest({ "a!": ["b", "c"] }));
    expect(index.getAllExpanded("b")).toBe(true);
    expect(index.getAllExpanded("c")).toBe(true);
    expect(index.getAllExpanded("a")).toBe(true);
  });

  test("a node with children answers false while any of them is closed", () => {
    // a! → b (closed) → c. `b` has a child, so `b` being closed is real.
    const index = buildSubtreeExpandIndex(forest({ "a!": ["b"], b: ["c"] }));
    expect(index.getAllExpanded("b")).toBe(false);
    expect(index.getAllExpanded("a")).toBe(false);
    expect(index.getAllExpanded("c")).toBe(true);
  });

  test("a closed node answers false even when everything below it is open", () => {
    const index = buildSubtreeExpandIndex(forest({ a: ["b!"], "b!": ["c"] }));
    expect(index.getAllExpanded("a")).toBe(false);
    expect(index.getAllExpanded("b")).toBe(true);
  });

  test("answers every node of the forest from one walk, not just the roots", () => {
    // The whole point of the index: a deep closed node must not stop the walk
    // from reaching (and answering for) the nodes under it.
    const index = buildSubtreeExpandIndex(
      forest({ "a!": ["b"], b: ["c"], "c!": ["d"], d: ["e"] }),
    );
    expect(index.getAllExpanded("c")).toBe(false);
    expect(index.getAllExpanded("d")).toBe(false);
    expect(index.getAllExpanded("e")).toBe(true);
  });

  test("an unknown id answers true and writes nothing", () => {
    const index = buildSubtreeExpandIndex(forest({ "a!": ["b"] }));
    expect(index.getAllExpanded("nope")).toBe(true);
    expect(index.getSubtreeChanges("nope", true)).toEqual([]);
  });

  test("expanding emits only the closed nodes that have children", () => {
    // a! → b (closed, has c) → c! (has d) → d (leaf). Only `b` changes: `a` and
    // `c` are already open, `d` has nothing to open.
    const index = buildSubtreeExpandIndex(
      forest({ "a!": ["b"], b: ["c!"], "c!": ["d"] }),
    );
    expect(index.getSubtreeChanges("a", true)).toEqual([
      { id: "b", expanded: true },
    ]);
  });

  test("collapsing includes the root itself and skips leaves", () => {
    const index = buildSubtreeExpandIndex(
      forest({ "a!": ["b!", "x"], "b!": ["c"] }),
    );
    expect(index.getSubtreeChanges("a", false)).toEqual([
      { id: "a", expanded: false },
      { id: "b", expanded: false },
    ]);
  });

  test("a flip that changes nothing emits an empty batch", () => {
    const index = buildSubtreeExpandIndex(
      forest({ "a!": ["b!"], "b!": ["c"] }),
    );
    expect(index.getSubtreeChanges("a", true)).toEqual([]);
  });

  test("the batch is scoped to the named subtree, never its siblings", () => {
    const index = buildSubtreeExpandIndex(
      forest({ root: ["a", "b"], a: ["a1"], b: ["b1"] }),
    );
    expect(index.getSubtreeChanges("a", true)).toEqual([
      { id: "a", expanded: true },
    ]);
  });

  test("answers across several roots", () => {
    const index = buildSubtreeExpandIndex(forest({ a: ["a1"], "b!": ["b1"] }));
    expect(index.getAllExpanded("a")).toBe(false);
    expect(index.getAllExpanded("b")).toBe(true);
  });
});
