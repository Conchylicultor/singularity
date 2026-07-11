import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { TaskListItem, TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { buildDepsTree, type DepsTreeRow } from "./deps-tree";
import { taskClusterIds } from "./cluster";

// Minimal TaskListItem factory. `deps` is `task.dependencies` (dependent →
// dependency), OLDEST edge first — the tasks_v ordering buildDepsTree relies on
// for the primary-parent pick. `folderId` is the creation ("created under") edge.
function task(
  id: string,
  deps: string[] = [],
  opts: { folderId?: string | null; status?: TaskStatus } = {},
): TaskListItem {
  const status = opts.status ?? "new";
  return {
    id,
    folderId: opts.folderId ?? null,
    groupId: null,
    title: id,
    titleAuto: true,
    author: "user",
    droppedAt: null,
    heldAt: null,
    expanded: false,
    rank: Rank.from("a0"),
    createdAt: new Date("2026-07-10T00:00:00Z"),
    updatedAt: new Date("2026-07-10T00:00:00Z"),
    status,
    active: !["done", "dropped"].includes(status),
    finishedAt: null,
    dependencies: deps,
  };
}

// Index the derived rows by id for assertions.
function byId(rows: DepsTreeRow[]): Map<string, DepsTreeRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

function parent(rows: DepsTreeRow[], id: string): string | null {
  return byId(rows).get(id)!.depsParentId;
}

function extras(rows: DepsTreeRow[], id: string): string[] {
  return byId(rows).get(id)!.extraDeps.map((t) => t.id);
}

const members = (...ids: string[]) => new Set(ids);

describe("taskClusterIds", () => {
  test("follows dependency edges in BOTH directions (blockers and dependents)", () => {
    // A ← B ← C (B depends on A, C depends on B). Seed from the middle: the
    // cluster reaches the blocker A AND the dependent C.
    const tasks = [task("A"), task("B", ["A"]), task("C", ["B"])];
    expect(taskClusterIds(tasks, "B", new Set())).toEqual(members("A", "B", "C"));
  });

  test("pulls in created children (creation edge, downward)", () => {
    // B and C were created under A (folderId = A), no dependency edges.
    const tasks = [task("A"), task("B", [], { folderId: "A" }), task("C", [], { folderId: "A" })];
    expect(taskClusterIds(tasks, "A", new Set())).toEqual(members("A", "B", "C"));
  });

  test("pulls in the creator and siblings (creation edge, upward + across)", () => {
    // Viewing a created child B reaches its creator A and its sibling C — 'two
    // independent tasks shown because one created the other'.
    const tasks = [task("A"), task("B", [], { folderId: "A" }), task("C", [], { folderId: "A" })];
    expect(taskClusterIds(tasks, "B", new Set())).toEqual(members("A", "B", "C"));
  });

  test("unions dependency and creation relations", () => {
    // A created B (folder). B depends on X. X created Y. Seed B ⇒ all four.
    const tasks = [
      task("A"),
      task("B", ["X"], { folderId: "A" }),
      task("X"),
      task("Y", [], { folderId: "X" }),
    ];
    expect(taskClusterIds(tasks, "B", new Set())).toEqual(members("A", "B", "X", "Y"));
  });

  test("does NOT traverse creation edges through a container/bucket", () => {
    // BUCKET holds hundreds of unrelated tasks. Selected S lives directly under
    // it alongside sibling U. The bucket must not drag U (or itself) in.
    const tasks = [
      task("BUCKET"),
      task("S", [], { folderId: "BUCKET" }),
      task("U", [], { folderId: "BUCKET" }),
    ];
    const containers = new Set(["BUCKET"]);
    // S has no deps and no children ⇒ isolated once the bucket is a boundary.
    expect(taskClusterIds(tasks, "S", containers)).toEqual(members("S"));
  });

  test("a container is a boundary, not fanned out, even when a real folder nests it", () => {
    // Real folder F created child C. F sits under BUCKET. Viewing C reaches F
    // (real creator) but stops at BUCKET — never expanding the bucket's siblings.
    const tasks = [
      task("BUCKET"),
      task("F", [], { folderId: "BUCKET" }),
      task("C", [], { folderId: "F" }),
      task("OTHER", [], { folderId: "BUCKET" }),
    ];
    const containers = new Set(["BUCKET"]);
    expect(taskClusterIds(tasks, "C", containers)).toEqual(members("F", "C"));
  });

  test("isolated task yields just itself; unknown root yields empty", () => {
    const tasks = [task("A"), task("B", ["X"]), task("X")];
    expect(taskClusterIds(tasks, "A", new Set())).toEqual(members("A"));
    expect(taskClusterIds(tasks, "missing", new Set())).toEqual(new Set());
  });
});

describe("buildDepsTree", () => {
  test("linear chain: each task nests under its single prerequisite", () => {
    const tasks = [task("A"), task("B", ["A"]), task("C", ["B"])];
    const rows = buildDepsTree(tasks, members("A", "B", "C"));

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(["A", "B", "C"]));
    expect(parent(rows, "A")).toBeNull();
    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("B");
    for (const r of rows) expect(r.extraDeps).toEqual([]);
  });

  test("fan-out: parallel children share one parent", () => {
    const tasks = [task("A"), task("B", ["A"]), task("C", ["A"])];
    const rows = buildDepsTree(tasks, members("A", "B", "C"));

    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("A");
  });

  test("fan-in: primary parent is the oldest edge, the rest become chips", () => {
    const tasks = [task("A"), task("B"), task("C"), task("D", ["A", "B", "C"])];
    const rows = buildDepsTree(tasks, members("A", "B", "C", "D"));

    expect(parent(rows, "D")).toBe("A");
    expect(extras(rows, "D")).toEqual(["B", "C"]);
  });

  test("diamond: bottom task fans in, top fans out", () => {
    const tasks = [
      task("A"),
      task("B", ["A"]),
      task("C", ["A"]),
      task("D", ["B", "C"]),
    ];
    const rows = buildDepsTree(tasks, members("A", "B", "C", "D"));

    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("A");
    expect(parent(rows, "D")).toBe("B");
    expect(extras(rows, "D")).toEqual(["C"]);
  });

  test("a settled task in the middle of a chain still gets a row", () => {
    const tasks = [task("A"), task("B", ["A"], { status: "done" }), task("C", ["B"])];
    const rows = buildDepsTree(tasks, members("A", "B", "C"));

    expect(byId(rows).get("B")!.status).toBe("done");
    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("B");
  });

  test("a creation-only member (no in-cluster deps) renders as a root", () => {
    // Y is in the set only because it was created under X; it has no dependency,
    // so it has no primary parent and surfaces as an independent root here.
    const tasks = [task("X"), task("Y", [], { folderId: "X" })];
    const rows = buildDepsTree(tasks, members("X", "Y"));

    expect(parent(rows, "X")).toBeNull();
    expect(parent(rows, "Y")).toBeNull();
    expect(extras(rows, "Y")).toEqual([]);
  });

  test("dependencies pointing outside the member set are ignored", () => {
    const tasks = [task("A", ["ghost"]), task("B", ["A"])];
    const rows = buildDepsTree(tasks, members("A", "B"));

    expect(parent(rows, "A")).toBeNull();
    expect(extras(rows, "A")).toEqual([]);
    expect(parent(rows, "B")).toBe("A");
  });

  test("ids in the set but absent from the task list are skipped", () => {
    const rows = buildDepsTree([task("A")], members("A", "missing"));
    expect(rows.map((r) => r.id)).toEqual(["A"]);
  });
});
