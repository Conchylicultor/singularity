import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { buildTree } from "@plugins/primitives/plugins/tree/core";
import {
  childrenOf,
  visibleChildrenOf,
  type Block,
  type BlockNode,
} from "../../core";
import { flattenVisible, subtreeOf } from "./flatten-blocks";

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
  return flattenVisible(buildTree(sortByRank(rows)), anchorTypes).map(
    (f) => f.block.id,
  );
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
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: false }),
      row("X", null),
    );
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
      if (rows.some((r) => r.type === ANCHOR && !r.expanded))
        collapsedAnchorSeeds++;

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

describe("subtreeOf — the zoomed view's forest", () => {
  function zoomIds(rows: Block[], rootId: string): string[] | null {
    const view = subtreeOf(buildTree(sortByRank(rows)), rootId);
    return view === null
      ? null
      : flattenVisible(view, anchorTypes).map((f) => f.block.id);
  }

  test("finds a nested block and renders it at depth 0 with its subtree below", () => {
    const rows = forest(
      row("A", null),
      row("B", "A"),
      row("B1", "B"),
      row("B1a", "B1"),
      row("B2", "B"),
      row("C", null),
    );
    const view = subtreeOf(buildTree(sortByRank(rows)), "B")!;
    const flat = flattenVisible(view, anchorTypes);
    expect(flat.map((f) => [f.block.id, f.depth])).toEqual([
      ["B", 0],
      ["B1", 1],
      ["B1a", 2],
      ["B2", 1],
    ]);
  });

  test("a top-level block zooms to itself and its children only", () => {
    const rows = forest(row("A", null), row("A1", "A"), row("C", null));
    expect(zoomIds(rows, "A")).toEqual(["A", "A1"]);
  });

  test("a leaf zooms to its one line", () => {
    const rows = forest(row("A", null), row("A1", "A"));
    expect(zoomIds(rows, "A1")).toEqual(["A1"]);
  });

  test("a collapsed root still folds — the fold is the block's own state", () => {
    const rows = forest(row("A", null, { expanded: false }), row("A1", "A"));
    expect(zoomIds(rows, "A")).toEqual(["A"]);
  });

  test("a zoomed CONTAINER shows its box's lines — its own row renders no line", () => {
    const rows = forest(
      row("X", null),
      row("K", null, { type: ANCHOR }),
      row("K1", "K"),
      row("K2", "K"),
    );
    expect(zoomIds(rows, "K")).toEqual(["K", "K1", "K2"]);
  });

  test("a missing root is null — the gone state, never an empty view", () => {
    const rows = forest(row("A", null), row("A1", "A"));
    expect(zoomIds(rows, "ghost")).toBeNull();
  });

  test("≡ the matching run of the full flatten, depth shifted, over a fuzz forest", () => {
    // The zoom must show exactly what the page shows under that block — no
    // line more, no line less. Checked for every root that renders UNFOLDED on
    // the page (no collapsed ancestor): a root inside a fold is not on screen
    // there at all, and a borrowed line of a collapsed card shows no children
    // on the page while its zoom — where the card is not in view — does.
    let checkedRoots = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rows = randomForest(seed);
      const tree = buildTree(sortByRank(rows));
      const full = flattenVisible(tree, anchorTypes);
      const byRowId = new Map(rows.map((r) => [r.id, r]));
      const unfolded = (id: string): boolean => {
        let cur = byRowId.get(id)!.parentId;
        while (cur !== null) {
          const p = byRowId.get(cur)!;
          if (!p.expanded) return false;
          cur = p.parentId;
        }
        return true;
      };
      for (const r of rows) {
        if (!unfolded(r.id)) continue;
        const at = full.findIndex((f) => f.block.id === r.id);
        expect(at).toBeGreaterThanOrEqual(0);
        const rootDepth = full[at]!.depth;
        let end = at + 1;
        while (end < full.length && full[end]!.depth > rootDepth) end++;
        const expected = full.slice(at, end).map((f, i) => ({
          id: f.block.id,
          depth: f.depth - rootDepth,
          childCount: f.childCount,
          firstVisibleChildType: f.firstVisibleChildType,
          // The root's ordinal restarts: it has no siblings in its own view.
          ordinal: i === 0 ? 1 : f.ordinal,
        }));
        const zoom = flattenVisible(subtreeOf(tree, r.id)!, anchorTypes).map(
          (f) => ({
            id: f.block.id,
            depth: f.depth,
            childCount: f.childCount,
            firstVisibleChildType: f.firstVisibleChildType,
            ordinal: f.ordinal,
          }),
        );
        expect(zoom).toEqual(expected);
        checkedRoots++;
      }
    }
    expect(checkedRoots).toBeGreaterThan(1000);
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
