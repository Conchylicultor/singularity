import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type {
  Block,
  BlockOp,
  BlockOpContext,
  IdentifiedBlock,
} from "../../core";
import { predictOp, toNodes } from "./optimistic-block-ops";
import { scopeAdmits, scopeNodes } from "./zoom-scope";

// ---------------------------------------------------------------------------
// Fixture — the zoom root R sits two levels down, with a sibling on each side
// of it and of its parent, so "outside" is reachable in every direction.
//
//   pg (page row, not in the forest)
//   ├─ P
//   │  ├─ O          (before R, same parent)
//   │  ├─ R          ← the zoom root
//   │  │  ├─ R1
//   │  │  ├─ R2
//   │  │  │  └─ R2a
//   │  │  └─ B      (a container anchor)
//   │  │     └─ B1
//   │  └─ Q          (after R, same parent)
//   └─ S
// ---------------------------------------------------------------------------

const PAGE = "pg";
const BOX = "box";
const OP_CTX: BlockOpContext = { anchorTypes: new Set([BOX]) };

function rows(): Block[] {
  const ranks = new Map<string | null, Rank | null>();
  const row = (id: string, parentId: string, type = "text"): Block => {
    const prev = ranks.get(parentId) ?? null;
    const rank = Rank.between(prev, null);
    ranks.set(parentId, rank);
    return {
      id,
      pageId: PAGE,
      parentId,
      type,
      data: type === BOX ? {} : { text: [{ text: id }] },
      rank,
      expanded: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as Block;
  };
  return [
    row("P", PAGE),
    row("O", "P"),
    row("R", "P"),
    row("R1", "R"),
    row("R2", "R"),
    row("R2a", "R2"),
    row("B", "R", BOX),
    row("B1", "B"),
    row("Q", "P"),
    row("S", PAGE),
  ];
}

const ROOT = "R";

/** The reducer's after-state for `op`, and whether the zoom on R admits it. */
function admitted(op: BlockOp, before = rows()): boolean {
  const { after, written } = predictOp(op, before, OP_CTX);
  // Every case below is a REAL write — a refused op (empty diff) never reaches
  // the zoom's rule, so a case that silently no-ops would test nothing.
  expect(written.length).toBeGreaterThan(0);
  return scopeAdmits(before, after, ROOT);
}

function forest(id: string): IdentifiedBlock[] {
  return [
    { id, type: "text", data: { text: [] }, expanded: true, children: [] },
  ];
}

describe("scopeAdmits — writes inside the view are admitted", () => {
  const cases: [string, BlockOp][] = [
    [
      "insert after a child",
      { kind: "insert", newId: "n", type: "text", data: {}, afterId: "R1" },
    ],
    [
      "insert before the first child",
      { kind: "insert", newId: "n", type: "text", data: {}, beforeId: "R1" },
    ],
    [
      "insert as the root's last child",
      { kind: "insert", newId: "n", type: "text", data: {}, parentId: ROOT },
    ],
    [
      "split a child mid-line",
      { kind: "split", blockId: "R1", position: 1, newId: "n", asChild: false },
    ],
    [
      "split the root with its tail as a child",
      { kind: "split", blockId: ROOT, position: 1, newId: "n", asChild: true },
    ],
    ["merge the first child into the root", { kind: "merge", blockId: "R1" }],
    ["indent a child under its sibling", { kind: "indent", blockIds: ["R2"] }],
    [
      "outdent a grandchild to the root's level",
      { kind: "outdent", blockIds: ["R2a"] },
    ],
    ["delete a child", { kind: "delete", blockIds: ["R2"] }],
    [
      "move a grandchild before the first child",
      {
        kind: "move",
        blockId: "R2a",
        parentId: ROOT,
        targetId: "R1",
        zone: "before",
      },
    ],
    [
      "bulk-move to the start of the root",
      { kind: "bulkMove", ids: ["R2a"], parentId: ROOT, afterId: null },
    ],
    [
      "paste at the start of the root",
      { kind: "paste", forest: forest("n"), afterId: null, parentId: ROOT },
    ],
    [
      "paste after a child",
      { kind: "paste", forest: forest("n"), afterId: "R1" },
    ],
    [
      "duplicate a child in place",
      {
        kind: "duplicate",
        placements: [{ afterId: "R1", forest: forest("n") }],
      },
    ],
    ["unwrap a container inside the root", { kind: "unwrap", blockId: "B" }],
  ];
  for (const [name, op] of cases) {
    test(name, () => expect(admitted(op)).toBe(true));
  }
});

describe("scopeAdmits — writes that would leave the view are refused", () => {
  const cases: [string, BlockOp][] = [
    [
      "insert after the root (a sibling outside)",
      { kind: "insert", newId: "n", type: "text", data: {}, afterId: ROOT },
    ],
    [
      "insert before the root",
      { kind: "insert", newId: "n", type: "text", data: {}, beforeId: ROOT },
    ],
    [
      "insert under the root's parent",
      { kind: "insert", newId: "n", type: "text", data: {}, parentId: "P" },
    ],
    [
      "split the root with a sibling tail",
      { kind: "split", blockId: ROOT, position: 1, newId: "n", asChild: false },
    ],
    ["merge the root into the line above it", { kind: "merge", blockId: ROOT }],
    ["outdent a child past the root", { kind: "outdent", blockIds: ["R1"] }],
    [
      "indent the next sibling INTO the root (an outside row changes)",
      { kind: "indent", blockIds: ["Q"] },
    ],
    ["delete the root", { kind: "delete", blockIds: [ROOT] }],
    ["delete a row outside", { kind: "delete", blockIds: ["S"] }],
    [
      "move a child out",
      {
        kind: "move",
        blockId: "R1",
        parentId: PAGE,
        targetId: "S",
        zone: "after",
      },
    ],
    [
      "move the root",
      {
        kind: "move",
        blockId: ROOT,
        parentId: "P",
        targetId: "Q",
        zone: "after",
      },
    ],
    [
      "bulk-move a child under the root's parent",
      { kind: "bulkMove", ids: ["R1"], parentId: "P", afterId: null },
    ],
    [
      "paste after the root",
      { kind: "paste", forest: forest("n"), afterId: ROOT },
    ],
    [
      "duplicate the root (its clone lands beside it)",
      {
        kind: "duplicate",
        placements: [{ afterId: ROOT, forest: forest("n") }],
      },
    ],
    [
      "unwrap the root's parent (reparents the root)",
      { kind: "unwrap", blockId: "P" },
    ],
  ];
  // `unwrap P` needs P to be a container for the reducer to act on it.
  const withBoxParent = () =>
    rows().map((r) => (r.id === "P" ? { ...r, type: BOX, data: {} } : r));
  for (const [name, op] of cases) {
    test(name, () => {
      const before = op.kind === "unwrap" ? withBoxParent() : rows();
      expect(admitted(op, before)).toBe(false);
    });
  }
});

describe("scopeAdmits — direct row writes", () => {
  const edit = (id: string, patch: Partial<Block>) => {
    const before = rows();
    const after = before.map((r) => (r.id === id ? { ...r, ...patch } : r));
    return scopeAdmits(before, after, ROOT);
  };

  test("the root's own type, data and fold are its content", () => {
    expect(edit(ROOT, { type: "heading" })).toBe(true);
    expect(edit(ROOT, { data: { text: [{ text: "new" }] } })).toBe(true);
    expect(edit(ROOT, { expanded: false })).toBe(true);
  });

  test("an outside row's fold may change — the reducer opens containers around a split", () => {
    expect(edit("P", { expanded: false })).toBe(true);
  });

  test("an outside row's content may not", () => {
    expect(edit("S", { data: { text: [{ text: "x" }] } })).toBe(false);
    expect(edit("Q", { type: "heading" })).toBe(false);
  });

  test("a gone root admits nothing", () => {
    const before = rows().filter((r) => r.id !== ROOT && r.parentId !== ROOT);
    expect(scopeAdmits(before, before, ROOT)).toBe(false);
  });
});

describe("scopeNodes — the resolver's view", () => {
  test("the root and its descendants only, the root lifted to the top level", () => {
    const view = scopeNodes(toNodes(rows()), ROOT);
    expect(view.map((n) => n.id).sort()).toEqual(
      ["B", "B1", "R", "R1", "R2", "R2a"].sort(),
    );
    expect(view.find((n) => n.id === ROOT)!.parentId).toBeNull();
    expect(view.find((n) => n.id === "R1")!.parentId).toBe(ROOT);
  });
});
