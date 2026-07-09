import { describe, expect, test } from "bun:test";
import { captureProcessTree, subtreePids, type ProcessTree } from "./process-tree";

function treeOf(...edges: Array<[pid: number, ppid: number]>): ProcessTree {
  const children = new Map<number, number[]>();
  for (const [pid, ppid] of edges) {
    const siblings = children.get(ppid);
    if (siblings) siblings.push(pid);
    else children.set(ppid, [pid]);
  }
  return { children };
}

describe("subtreePids", () => {
  test("a root with no children is its own subtree", () => {
    expect(subtreePids(treeOf([5302, 99082]), 42)).toEqual([42]);
  });

  test("walks a linear chain to the leaf", () => {
    // The observed daemon relocation: launcher → daemon → pty-host → session.
    const tree = treeOf([5302, 99082], [5330, 5302], [5414, 5330]);
    expect(subtreePids(tree, 99082)).toEqual([99082, 5302, 5330, 5414]);
  });

  test("visits a branching tree breadth-first, excluding unrelated roots", () => {
    const tree = treeOf([2, 1], [3, 1], [4, 2], [5, 3], [99, 98]);
    expect(subtreePids(tree, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  test("terminates on a cycle in the snapshot", () => {
    const tree = treeOf([2, 1], [3, 2], [1, 3]);
    expect(subtreePids(tree, 1)).toEqual([1, 2, 3]);
  });

  test("a self-parented pid does not loop", () => {
    expect(subtreePids(treeOf([1, 1]), 1)).toEqual([1]);
  });
});

describe("captureProcessTree", () => {
  test("indexes the lister's rows by parent", async () => {
    const tree = await captureProcessTree(async () => [
      { pid: 5302, ppid: 99082 },
      { pid: 5303, ppid: 99082 },
      { pid: 5330, ppid: 5302 },
    ]);
    expect(tree.children.get(99082)).toEqual([5302, 5303]);
    expect(tree.children.get(5302)).toEqual([5330]);
    expect(tree.children.get(5330)).toBeUndefined();
  });

  test("propagates a lister failure rather than yielding an empty tree", async () => {
    // `expect(p).rejects.toThrow()` is typed `void` by bun's matchers, so awaiting
    // it trips `@typescript-eslint/await-thenable`. Capture the rejection instead.
    let caught: unknown;
    try {
      await captureProcessTree(() => Promise.reject(new Error("ps exploded")));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("ps exploded");
  });
});
