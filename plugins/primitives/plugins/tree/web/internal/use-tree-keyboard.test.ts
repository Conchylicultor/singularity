import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { TreeNode } from "../../core";
import { treeKeyMove, type KeyboardLine } from "./use-tree-keyboard";
import type { TreeItem } from "./types";

type Row = TreeItem;

function node(
  id: string,
  parentId: string | null,
  children: TreeNode<Row>[] = [],
  expanded = false,
): TreeNode<Row> {
  return { id, parentId, rank: Rank.from("a0"), expanded, children };
}

// src (open) ─ main.ts
//            └ util.ts
// docs (closed, lazily listed)
// README.md
const main = node("src/main.ts", "src");
const util = node("src/util.ts", "src");
const src = node("src", null, [main, util], true);
const docs = node("docs", null);
const readme = node("README.md", null);
const lines: KeyboardLine<Row>[] = [
  { kind: "node", node: src, depth: 0 },
  { kind: "node", node: main, depth: 1 },
  { kind: "node", node: util, depth: 1 },
  { kind: "node", node: docs, depth: 0 },
  { kind: "placeholder" },
  { kind: "node", node: readme, depth: 0 },
];
const lazy = {
  hasChildren: (r: Row) => r.id === "docs",
  state: () => ({ kind: "unloaded" as const }),
  load: () => {},
};

describe("treeKeyMove", () => {
  test("down and up walk the painted rows, skipping placeholders", () => {
    expect(treeKeyMove("ArrowDown", "src", lines, lazy)).toEqual({
      kind: "focus",
      id: "src/main.ts",
    });
    expect(treeKeyMove("ArrowDown", "docs", lines, lazy)).toEqual({
      kind: "focus",
      id: "README.md",
    });
    expect(treeKeyMove("ArrowUp", "src", lines, lazy)).toEqual({
      kind: "none",
    });
    expect(treeKeyMove("End", "src", lines, lazy)).toEqual({
      kind: "focus",
      id: "README.md",
    });
  });

  test("right opens a closed row with (possible) children, else steps in", () => {
    expect(treeKeyMove("ArrowRight", "docs", lines, lazy)).toEqual({
      kind: "expand",
      id: "docs",
      expanded: true,
    });
    expect(treeKeyMove("ArrowRight", "src", lines, lazy)).toEqual({
      kind: "focus",
      id: "src/main.ts",
    });
    expect(treeKeyMove("ArrowRight", "README.md", lines, lazy)).toEqual({
      kind: "none",
    });
  });

  test("left closes an open row, else steps out to the parent", () => {
    expect(treeKeyMove("ArrowLeft", "src", lines, lazy)).toEqual({
      kind: "expand",
      id: "src",
      expanded: false,
    });
    expect(treeKeyMove("ArrowLeft", "src/util.ts", lines, lazy)).toEqual({
      kind: "focus",
      id: "src",
    });
    expect(treeKeyMove("ArrowLeft", "README.md", lines, lazy)).toEqual({
      kind: "none",
    });
  });
});
