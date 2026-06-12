/**
 * Tests for the tree core — the pure DnD/hierarchy utilities every list plugin
 * leans on (`buildTree`, `isDescendant`, `selectionRoots`, `subtreeIds`,
 * `computeDrop`). Run with
 * `bun test plugins/primitives/plugins/tree/core/internal/tree.test.ts`.
 *
 * The load-bearing invariant: a DnD move must never create a cycle. Every
 * consumer guards the move with `isDescendant(rows, draggedId, targetId)`
 * BEFORE calling `computeDrop` (see tree-list.tsx, block-editor.tsx,
 * block-ops.ts), so the acyclicity contract under test is the COMPOSITE one:
 * an `isDescendant`-guarded `computeDrop`, applied to the rows, yields a forest
 * that is still a valid acyclic tree containing exactly the original node set.
 *
 * Three layers, mirroring keyed-delta-merge.test.ts: explicit scenarios over a
 * known fixture, property tests over many seeds, and a move-sequence simulation
 * that fuzzes a tree through hundreds of guarded drops and asserts the forest
 * stays acyclic and node-preserving the whole way.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  buildTree,
  computeDrop,
  isDescendant,
  selectionRoots,
  subtreeIds,
  type DropZone,
  type TreeNode,
} from "./tree";

type Row = { id: string; parentId: string | null; rank: Rank };

// Deterministic PRNG (mulberry32) so a fuzz failure is reproducible from its
// seed — `Math.random()` would make a red run impossible to replay.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- helpers shared by property tests ----

// Walk a built forest and collect every node id, asserting no id repeats.
function collectTreeIds(roots: TreeNode<Row>[]): string[] {
  const out: string[] = [];
  const visit = (n: TreeNode<Row>) => {
    out.push(n.id);
    n.children.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}

// True iff `rows` describe an acyclic forest: every parentId either is absent
// from the set (treated as a root) or is reachable to a root without revisiting.
function isAcyclic(rows: readonly Row[]): boolean {
  const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));
  for (const r of rows) {
    let cur: string | null = r.id;
    const seen = new Set<string>();
    while (cur) {
      if (seen.has(cur)) return false; // revisited → cycle
      seen.add(cur);
      cur = parents.get(cur) ?? null;
    }
  }
  return true;
}

// Apply a computeDrop result to the flat rows (what the server mutation does).
function applyDrop(
  rows: Row[],
  draggedId: string,
  dest: { parentId: string | null; rank: Rank },
): Row[] {
  return rows.map((r) =>
    r.id === draggedId ? { ...r, parentId: dest.parentId, rank: dest.rank } : r,
  );
}

// Build a random flat forest of `n` nodes with valid (acyclic) parent links and
// sibling-unique ranks. Each node may point at an already-emitted node as its
// parent, which guarantees acyclicity by construction.
function randomForest(rand: () => number, n: number): Row[] {
  const rows: Row[] = [];
  // Per-parent running rank so siblings get strictly increasing, distinct ranks.
  const lastRankUnder = new Map<string | null, Rank | null>();
  for (let i = 0; i < n; i++) {
    const id = `n${i}`;
    // Parent is null (root) or one of the prior nodes — never a later one.
    let parentId: string | null = null;
    if (i > 0 && rand() < 0.7) {
      parentId = `n${Math.floor(rand() * i)}`;
    }
    const prev = lastRankUnder.get(parentId) ?? null;
    const rank = Rank.between(prev, null);
    lastRankUnder.set(parentId, rank);
    rows.push({ id, parentId, rank });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

describe("buildTree — scenarios", () => {
  const r = (id: string, parentId: string | null) => ({
    id,
    parentId,
    rank: Rank.from(id),
  });

  test("flat list → all roots, no children", () => {
    const roots = buildTree([r("a", null), r("b", null)]);
    expect(roots.map((n) => n.id)).toEqual(["a", "b"]);
    expect(roots.every((n) => n.children.length === 0)).toBe(true);
  });

  test("parent/child linkage is consistent", () => {
    const roots = buildTree([r("a", null), r("b", "a"), r("c", "a")]);
    expect(roots.map((n) => n.id)).toEqual(["a"]);
    expect(roots[0]!.children.map((n) => n.id)).toEqual(["b", "c"]);
  });

  test("node with an absent parentId becomes a root (orphan promotion)", () => {
    // 'b' points at a parent not present in the set → promoted to root.
    const roots = buildTree([r("a", null), r("b", "missing")]);
    expect(roots.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  test("deep chain preserves every node exactly once", () => {
    const rows = [r("a", null), r("b", "a"), r("c", "b"), r("d", "c")];
    const roots = buildTree(rows);
    expect(collectTreeIds(roots).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("buildTree — property", () => {
  test("built tree contains exactly the input id set, no loss, no dup", () => {
    for (let seed = 1; seed <= 1500; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 1 + Math.floor(rand() * 20));

      const roots = buildTree(rows);
      const treeIds = collectTreeIds(roots);

      // No node lost, none duplicated: tree id multiset === input id set.
      expect(treeIds.slice().sort()).toEqual(rows.map((r) => r.id).sort());
      // Distinctness (no node appears under two parents).
      expect(new Set(treeIds).size).toBe(treeIds.length);

      // Every child's parentId points at the node it actually hangs under, and
      // root-level nodes are exactly those with no resolvable parent.
      const present = new Set(rows.map((r) => r.id));
      const verify = (n: TreeNode<Row>, parentId: string | null) => {
        expect(n.parentId).toBe(parentId);
        n.children.forEach((c) => verify(c, n.id));
      };
      roots.forEach((root) => {
        const hasResolvableParent =
          root.parentId !== null && present.has(root.parentId);
        expect(hasResolvableParent).toBe(false);
        verify(root, root.parentId);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// isDescendant
// ---------------------------------------------------------------------------

describe("isDescendant — scenarios", () => {
  // a → b → c (c child of b, b child of a); d unrelated.
  const rows: Row[] = [
    { id: "a", parentId: null, rank: Rank.from("a") },
    { id: "b", parentId: "a", rank: Rank.from("b") },
    { id: "c", parentId: "b", rank: Rank.from("c") },
    { id: "d", parentId: null, rank: Rank.from("d") },
  ];

  test("direct child is a descendant of its parent", () => {
    expect(isDescendant(rows, "a", "b")).toBe(true);
  });

  test("transitive descendant (grandchild) is detected", () => {
    expect(isDescendant(rows, "a", "c")).toBe(true);
  });

  test("ancestor is NOT a descendant of its child (direction matters)", () => {
    expect(isDescendant(rows, "c", "a")).toBe(false);
  });

  test("unrelated nodes are not descendants either way", () => {
    expect(isDescendant(rows, "a", "d")).toBe(false);
    expect(isDescendant(rows, "d", "a")).toBe(false);
  });

  test("a node IS its own descendant (reflexive — the cycle-guard semantics)", () => {
    // The loop checks `cur === ancestorId` before walking up, so candidate ===
    // ancestor returns true on the first iteration. Consumers rely on this:
    // `isDescendant(rows, draggedId, targetId)` rejects dropping a node onto
    // itself as well as into its subtree.
    expect(isDescendant(rows, "a", "a")).toBe(true);
    expect(isDescendant(rows, "c", "c")).toBe(true);
  });
});

describe("isDescendant — property", () => {
  test("matches an independent parent-chain walk on random forests", () => {
    for (let seed = 1; seed <= 1500; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 2 + Math.floor(rand() * 18));
      const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));

      // Independent reference: collect the ancestor set of each node (inclusive
      // of itself, matching the reflexive semantics) by walking parents.
      const ancestorsOf = (id: string): Set<string> => {
        const set = new Set<string>();
        let cur: string | null = id;
        while (cur && !set.has(cur)) {
          set.add(cur);
          cur = parents.get(cur) ?? null;
        }
        return set;
      };

      for (const cand of rows) {
        const anc = ancestorsOf(cand.id);
        for (const a of rows) {
          // isDescendant(anc, cand) ⇔ `a` is on cand's parent chain.
          expect(isDescendant(rows, a.id, cand.id)).toBe(anc.has(a.id));
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// selectionRoots + subtreeIds (other exported pure fns)
// ---------------------------------------------------------------------------

describe("selectionRoots + subtreeIds — scenarios", () => {
  // a → b → c ; a → d ; e (root, unrelated)
  const rows: Row[] = [
    { id: "a", parentId: null, rank: Rank.from("a") },
    { id: "b", parentId: "a", rank: Rank.from("b") },
    { id: "c", parentId: "b", rank: Rank.from("c") },
    { id: "d", parentId: "a", rank: Rank.from("d") },
    { id: "e", parentId: null, rank: Rank.from("e") },
  ];

  test("selectionRoots collapses descendants whose ancestor is also selected", () => {
    // a, b, c all selected → only a is a root.
    expect(selectionRoots(rows, new Set(["a", "b", "c"]))).toEqual(["a"]);
  });

  test("selectionRoots keeps independent selections, in row order", () => {
    expect(selectionRoots(rows, new Set(["b", "d", "e"]))).toEqual(["b", "d", "e"]);
  });

  test("subtreeIds returns the root then every descendant (BFS)", () => {
    expect(subtreeIds(rows, "a")).toEqual(["a", "b", "d", "c"]);
  });

  test("subtreeIds of a leaf is just the leaf", () => {
    expect(subtreeIds(rows, "c")).toEqual(["c"]);
  });
});

describe("selectionRoots + subtreeIds — property", () => {
  test("subtreeIds(root) ⊆ ids; root first; reflexive ancestor relation holds", () => {
    for (let seed = 1; seed <= 1200; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 2 + Math.floor(rand() * 18));
      const allIds = new Set(rows.map((r) => r.id));

      const root = rows[Math.floor(rand() * rows.length)]!;
      const sub = subtreeIds(rows, root.id);

      // Root is first; every returned id exists; no duplicates.
      expect(sub[0]).toBe(root.id);
      expect(new Set(sub).size).toBe(sub.length);
      sub.forEach((id) => expect(allIds.has(id)).toBe(true));

      // The subtree is exactly the set of nodes that have `root` as an ancestor
      // (reflexive) — cross-check against isDescendant.
      const expected = rows
        .filter((r) => isDescendant(rows, root.id, r.id))
        .map((r) => r.id);
      expect(sub.slice().sort()).toEqual(expected.slice().sort());
    }
  });

  test("selectionRoots never includes a node with a selected ancestor", () => {
    for (let seed = 1; seed <= 1200; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 2 + Math.floor(rand() * 18));
      const selected = new Set(rows.filter(() => rand() < 0.5).map((r) => r.id));
      const roots = selectionRoots(rows, selected);

      // Every returned id is selected.
      roots.forEach((id) => expect(selected.has(id)).toBe(true));
      // No returned root has a *different* selected ancestor.
      const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));
      for (const id of roots) {
        let cur = parents.get(id) ?? null;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          expect(selected.has(cur)).toBe(false);
          cur = parents.get(cur) ?? null;
        }
      }
      // Every selected id is covered: it's a root or has a selected ancestor.
      for (const r of rows) {
        if (!selected.has(r.id)) continue;
        if (roots.includes(r.id)) continue;
        let cur = parents.get(r.id) ?? null;
        let covered = false;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          if (selected.has(cur)) {
            covered = true;
            break;
          }
          cur = parents.get(cur) ?? null;
        }
        expect(covered).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// computeDrop — the critical one
// ---------------------------------------------------------------------------

describe("computeDrop — scenarios", () => {
  const mk = (id: string, parentId: string | null, rankStr: string): Row => ({
    id,
    parentId,
    rank: Rank.from(rankStr),
  });

  test("unknown target → null", () => {
    const rows = [mk("a", null, "a0")];
    expect(computeDrop(rows, "a", "after", "nope")).toBeNull();
  });

  test("drop 'child' nests under the target", () => {
    const rows = [mk("a", null, "a0"), mk("b", null, "a1")];
    const dest = computeDrop(rows, "b", "child", "a");
    expect(dest).not.toBeNull();
    expect(dest!.parentId).toBe("a");
  });

  test("drop 'before' a sibling lands before it (lower rank)", () => {
    const rows = [mk("a", null, "a0"), mk("b", null, "a2"), mk("c", null, "a4")];
    // Move c before b → c.rank must sort below b's rank.
    const dest = computeDrop(rows, "c", "before", "b");
    expect(dest).not.toBeNull();
    expect(dest!.parentId).toBe(null);
    expect(Rank.compare(dest!.rank, Rank.from("a2"))).toBe(-1);
  });

  test("drop 'after' a sibling lands after it (higher rank)", () => {
    const rows = [mk("a", null, "a0"), mk("b", null, "a2"), mk("c", null, "a4")];
    // Move a after b → a.rank must sort above b's rank.
    const dest = computeDrop(rows, "a", "after", "b");
    expect(dest).not.toBeNull();
    expect(Rank.compare(dest!.rank, Rank.from("a2"))).toBe(1);
  });

  test("dropping 'before'/'after' excludes the dragged node from its own neighborhood", () => {
    // a, b, c siblings; drop b after a — b is filtered out of siblings, so the
    // result sorts strictly between a and c.
    const rows = [mk("a", null, "a0"), mk("b", null, "a2"), mk("c", null, "a4")];
    const dest = computeDrop(rows, "b", "after", "a");
    expect(dest).not.toBeNull();
    expect(Rank.compare(dest!.rank, Rank.from("a0"))).toBe(1);
    expect(Rank.compare(dest!.rank, Rank.from("a4"))).toBe(-1);
  });
});

describe("computeDrop — property (guarded move stays acyclic & complete)", () => {
  test("an isDescendant-guarded drop yields a valid acyclic forest with all nodes preserved", () => {
    const zones: DropZone[] = ["before", "after", "child"];
    let guardedDrops = 0;
    let appliedDrops = 0;

    for (let seed = 1; seed <= 3000; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 3 + Math.floor(rand() * 20));
      const dragged = rows[Math.floor(rand() * rows.length)]!;
      const target = rows[Math.floor(rand() * rows.length)]!;
      const zone = zones[Math.floor(rand() * zones.length)]!;

      // The guard EVERY consumer applies before computeDrop. When the target is
      // inside the dragged node's subtree (or is the node itself), the move is
      // rejected — this is the sole cycle defense.
      if (isDescendant(rows, dragged.id, target.id)) {
        guardedDrops++;
        continue;
      }

      const dest = computeDrop(rows, dragged.id, zone, target.id);
      if (dest === null) continue; // impossible drop position — caller aborts.
      appliedDrops++;

      const next = applyDrop(rows, dragged.id, dest);

      // 1) Node set preserved exactly (same ids, count unchanged).
      expect(next.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
      // 2) The forest is still acyclic — the load-bearing invariant.
      expect(isAcyclic(next)).toBe(true);
      // 3) buildTree round-trips the post-drop rows without losing a node.
      expect(collectTreeIds(buildTree(next)).sort()).toEqual(
        rows.map((r) => r.id).sort(),
      );

      // 4) Rank places the node correctly relative to its NEW siblings.
      const moved = next.find((r) => r.id === dragged.id)!;
      expect(moved.parentId).toBe(dest.parentId);
      const sibs = next
        .filter((r) => r.parentId === dest.parentId && r.id !== dragged.id)
        .sort((a, b) => Rank.compare(a.rank, b.rank));
      // The moved node's rank is distinct from every sibling (no rank collision).
      for (const s of sibs) {
        expect(Rank.equals(s.rank, moved.rank)).toBe(false);
      }
      if (zone !== "child") {
        // before/after: the moved node lands adjacent to the target in rank
        // order — on the correct side of it.
        const targetRow = next.find((r) => r.id === target.id)!;
        if (zone === "before") {
          expect(Rank.compare(moved.rank, targetRow.rank)).toBe(-1);
        } else {
          expect(Rank.compare(moved.rank, targetRow.rank)).toBe(1);
        }
      }
    }

    // Non-vacuity floor: the fuzz actually exercised both the guard and real
    // applied drops (not all seeds short-circuiting to null/guard).
    expect(guardedDrops).toBeGreaterThan(0);
    expect(appliedDrops).toBeGreaterThan(100);
  });
});

describe("computeDrop — move-sequence simulation", () => {
  // Drives a tree the way the UI does: hundreds of guarded drag-drops in a row,
  // each one re-reading the live rows. Invariant across the whole run: the
  // forest is ALWAYS acyclic and never loses or gains a node, no matter how the
  // random drops chain together.
  test("a long chain of guarded drops keeps the forest acyclic and node-complete", () => {
    const zones: DropZone[] = ["before", "after", "child"];
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      let rows = randomForest(rand, 5 + Math.floor(rand() * 15));
      const originalIds = rows.map((r) => r.id).sort();

      for (let step = 0; step < 80; step++) {
        const dragged = rows[Math.floor(rand() * rows.length)]!;
        const target = rows[Math.floor(rand() * rows.length)]!;
        const zone = zones[Math.floor(rand() * zones.length)]!;

        // Guard exactly as the consumers do.
        if (isDescendant(rows, dragged.id, target.id)) continue;
        const dest = computeDrop(rows, dragged.id, zone, target.id);
        if (dest === null) continue;
        rows = applyDrop(rows, dragged.id, dest);

        // After every applied move the forest must remain valid.
        expect(isAcyclic(rows)).toBe(true);
        expect(rows.map((r) => r.id).sort()).toEqual(originalIds);
      }

      // buildTree over the final state still recovers every original node.
      expect(collectTreeIds(buildTree(rows)).sort()).toEqual(originalIds);
    }
  });
});
