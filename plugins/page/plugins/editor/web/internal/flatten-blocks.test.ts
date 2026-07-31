import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { buildTree } from "@plugins/primitives/plugins/tree/core";
import { childrenOf, visibleChildrenOf, type Block, type BlockNode } from "../../core";
import { flattenVisible } from "./flatten-blocks";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ANCHOR = "container";

const anchorTypes = new Set([ANCHOR]);

let rankSeq = 0;
function row(
  id: string,
  parentId: string | null,
  opts: { type?: string; expanded?: boolean } = {},
): Block {
  rankSeq += 1;
  return {
    id,
    pageId: "p",
    parentId,
    type: opts.type ?? "text",
    data: { text: [] },
    // Zero-padded so the ranks stay lexicographically monotonic past base-36
    // digit 35 — `Rank` compares as TEXT, so an unpadded counter starts ordering
    // "a10" before "a9" and the fixture silently stops meaning what it reads as.
    rank: Rank.from(`a${rankSeq.toString(36).padStart(4, "0")}`).toJSON(),
    expanded: opts.expanded ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Block;
}

/** Rows in the order the fixture declares them, ranked to match that order. */
function forest(...rows: Block[]): Block[] {
  return rows;
}

/** What the real caller does before `buildTree` (`block-editor.tsx`). */
function sortByRank(rows: Block[]): Block[] {
  return [...rows].sort((a, b) => Rank.compare(a.rank, b.rank));
}

function flatIds(rows: Block[]): string[] {
  return flattenVisible(buildTree(sortByRank(rows)), anchorTypes).map((f) => f.block.id);
}

// ---------------------------------------------------------------------------

describe("flattenVisible — a collapsed container folds to its borrowed line", () => {
  test("shows the first child's line and nothing else", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: false }),
      row("C1", "A"),
      row("C2", "A"),
      row("AFTER", null),
    );
    expect(flatIds(rows)).toEqual(["A", "C1", "AFTER"]);
  });

  test("the borrowed line's OWN subtree folds away with the rest", () => {
    // R2: everything below the borrowed line goes, including what belongs to the
    // line itself — otherwise "fold" would leave a stump of arbitrary depth.
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: false }),
      row("C1", "A"),
      row("C1a", "C1"),
      row("C2", "A"),
    );
    expect(flatIds(rows)).toEqual(["A", "C1"]);
  });

  test("expanded, it shows everything — the flag is live, not inert", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: true }),
      row("C1", "A"),
      row("C2", "A"),
    );
    expect(flatIds(rows)).toEqual(["A", "C1", "C2"]);
  });

  test("a NESTED container chain still resolves to exactly one visible line", () => {
    // A renders no line, B renders no line, so the one line A shows is B's
    // borrowed one — reached by walking first children through both.
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: false }),
      row("B", "A", { type: ANCHOR, expanded: true }),
      row("G1", "B"),
      row("G2", "B"),
      row("C2", "A"),
    );
    expect(flatIds(rows)).toEqual(["A", "B", "G1"]);
  });

  test("a childless container still emits its own row (the one-line fallback box)", () => {
    const rows = forest(row("A", null, { type: ANCHOR, expanded: false }), row("X", null));
    expect(flatIds(rows)).toEqual(["A", "X"]);
  });
});

describe("flattenVisible ≡ visibleChildrenOf", () => {
  test("the surface's tree walk and the reducer's array walk agree, over a fuzz forest", () => {
    // Two encodings of ONE rule (`visibleChildRule`): the surface walks the
    // already-built tree so a render costs no per-node `childrenOf` scan, the
    // reducer walks the flat array. They are allowed to differ in cost, never in
    // answer — a drift here is the editor showing lines the ladders think are
    // hidden (or the reverse), which is how a keystroke ends up acting on
    // something off screen.
    let checked = 0;
    let collapsedAnchorSeeds = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const rows = randomForest(seed);
      if (rows.some((r) => r.type === ANCHOR && !r.expanded)) collapsedAnchorSeeds++;

      const flat = flattenVisible(buildTree(sortByRank(rows)), anchorTypes);
      const nodes = rows as unknown as BlockNode[];
      const isAnchor = (n: BlockNode) => n.type === ANCHOR;

      // Every emitted row, in order, is exactly what walking `visibleChildrenOf`
      // depth-first from the roots produces.
      const expected: string[] = [];
      const walk = (parentId: string | null) => {
        const kids =
          parentId === null
            ? childrenOf(nodes, null)
            : visibleChildrenOf(nodes, byId(nodes, parentId), isAnchor);
        for (const k of kids) {
          expected.push(k.id);
          walk(k.id);
        }
      };
      walk(null);

      expect(flat.map((f) => f.block.id)).toEqual(expected);
      checked += flat.length;
    }
    expect(checked).toBeGreaterThan(2000);
    expect(collapsedAnchorSeeds).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// Fuzz helpers
// ---------------------------------------------------------------------------

function byId(nodes: BlockNode[], id: string): BlockNode {
  const found = nodes.find((n) => n.id === id);
  if (!found) throw new Error(`fixture is inconsistent: no node ${id}`);
  return found;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A random forest with anchors and randomised collapse, ranked in build order. */
function randomForest(seed: number): Block[] {
  const rand = rng(seed);
  const rows: Block[] = [];
  const parents: (string | null)[] = [null];
  const n = 4 + Math.floor(rand() * 14);
  for (let i = 0; i < n; i++) {
    const id = `n${i}`;
    const parentId = parents[Math.floor(rand() * parents.length)] ?? null;
    const isAnchor = rand() < 0.3;
    rows.push(
      row(id, parentId, {
        type: isAnchor ? ANCHOR : "text",
        expanded: rand() < 0.6,
      }),
    );
    parents.push(id);
  }
  return rows;
}
