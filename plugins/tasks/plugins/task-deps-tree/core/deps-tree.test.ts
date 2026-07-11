import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { TaskListItem, TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { buildDepsTree, type DepsTreeRow } from "./deps-tree";

// Minimal TaskListItem factory. `deps` is `task.dependencies` (dependent →
// dependency), OLDEST edge first — the tasks_v ordering buildDepsTree relies on
// for the primary-parent pick.
function task(
  id: string,
  deps: string[] = [],
  status: TaskStatus = "new",
): TaskListItem {
  return {
    id,
    folderId: null,
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

describe("buildDepsTree", () => {
  test("linear chain: each task nests under its single prerequisite", () => {
    // C depends on B, B depends on A ⇒ tree A → B → C.
    const tasks = [task("A"), task("B", ["A"]), task("C", ["B"])];
    const rows = buildDepsTree(tasks, "B");

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(["A", "B", "C"]));
    expect(parent(rows, "A")).toBeNull();
    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("B");
    for (const r of rows) expect(r.extraDeps).toEqual([]);
  });

  test("fan-out: parallel children share one parent", () => {
    // B and C both depend on A ⇒ A with two parallel children.
    const tasks = [task("A"), task("B", ["A"]), task("C", ["A"])];
    const rows = buildDepsTree(tasks, "A");

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(["A", "B", "C"]));
    expect(parent(rows, "A")).toBeNull();
    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("A");
  });

  test("fan-in: primary parent is the oldest edge, the rest become chips", () => {
    // D depends on A (oldest), then B, then C ⇒ nests under A; B, C are chips.
    const tasks = [task("A"), task("B"), task("C"), task("D", ["A", "B", "C"])];
    const rows = buildDepsTree(tasks, "D");

    expect(parent(rows, "D")).toBe("A");
    expect(extras(rows, "D")).toEqual(["B", "C"]);
  });

  test("diamond: bottom task fans in, top fans out", () => {
    // B,C depend on A; D depends on B (oldest) then C.
    const tasks = [
      task("A"),
      task("B", ["A"]),
      task("C", ["A"]),
      task("D", ["B", "C"]),
    ];
    const rows = buildDepsTree(tasks, "A");

    expect(new Set(rows.map((r) => r.id))).toEqual(
      new Set(["A", "B", "C", "D"]),
    );
    expect(parent(rows, "A")).toBeNull();
    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("A");
    // D's primary parent is its oldest edge (B); C surfaces as a chip.
    expect(parent(rows, "D")).toBe("B");
    expect(extras(rows, "D")).toEqual(["C"]);
  });

  test("multiple roots render as top-level siblings", () => {
    // C depends on both A and B, which have no prerequisites ⇒ A is C's primary
    // parent; B is a root too (its dependent C keeps it in the component).
    const tasks = [task("A"), task("B"), task("C", ["A", "B"])];
    const rows = buildDepsTree(tasks, "C");

    expect(parent(rows, "A")).toBeNull();
    expect(parent(rows, "B")).toBeNull();
    expect(parent(rows, "C")).toBe("A");
    expect(extras(rows, "C")).toEqual(["B"]);
  });

  test("a settled task in the middle of a chain still gets a row", () => {
    // B is done but still sits between A and C structurally.
    const tasks = [
      task("A"),
      task("B", ["A"], "done"),
      task("C", ["B"]),
    ];
    const rows = buildDepsTree(tasks, "A");

    const b = byId(rows).get("B");
    expect(b).toBeDefined();
    expect(b!.status).toBe("done");
    expect(parent(rows, "B")).toBe("A");
    expect(parent(rows, "C")).toBe("B");
  });

  test("closure of size 1 (isolated task) yields no rows", () => {
    const tasks = [task("A"), task("B"), task("C", ["B"])];
    // A has no dependency edges at all ⇒ component is just {A} ⇒ [].
    expect(buildDepsTree(tasks, "A")).toEqual([]);
  });

  test("edges pointing outside the component are ignored", () => {
    // C depends on A (in-component via B→A? no) — build a case where a member's
    // dependency is filtered because it is outside the closure. Here Z is a
    // dependency of A but Z has no other connection, so it IS pulled in by the
    // closure walk; to test filtering we need a dep that is genuinely unreachable.
    // A depends on X; X is unreachable only if not present — represent as a
    // dangling id absent from the task list.
    const tasks = [task("A", ["ghost"]), task("B", ["A"])];
    const rows = buildDepsTree(tasks, "B");

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(["A", "B"]));
    // "ghost" is not a member ⇒ A has no primary parent, no chips.
    expect(parent(rows, "A")).toBeNull();
    expect(extras(rows, "A")).toEqual([]);
  });

  test("root absent from the task list yields no rows", () => {
    expect(buildDepsTree([task("A")], "missing")).toEqual([]);
  });
});
