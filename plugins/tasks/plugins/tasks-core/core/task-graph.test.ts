import { describe, expect, test } from "bun:test";
import type { TaskStatus } from "./internal/schema";
import { isSettled, SETTLED_STATUSES, TaskGraph, type TaskNode } from "./task-graph";

// Minimal node factory. `deps` is `task.dependencies` (dependent → dependency).
function node(
  id: string,
  status: TaskStatus,
  deps: string[] = [],
  groupId: string | null = null,
): TaskNode {
  return { id, status, dependencies: deps, groupId };
}

function ids(nodes: TaskNode[]): Set<string> {
  return new Set(nodes.map((n) => n.id));
}

// Canonical chain D → C → B → A (edge direction = dependent → dependency):
//   B depends on A, C depends on B, D depends on C.
// C is done; A, B, D are new. So the only path from A out to its dependents
// runs through the settled C to reach the active D.
function chain(cStatus: TaskStatus = "done", aStatus: TaskStatus = "new") {
  return [
    node("A", aStatus, []),
    node("B", "new", ["A"]),
    node("C", cStatus, ["B"]),
    node("D", "new", ["C"]),
  ];
}

describe("isSettled / SETTLED_STATUSES", () => {
  test("done and dropped are settled; held and others are not", () => {
    expect([...SETTLED_STATUSES].sort()).toEqual(["done", "dropped"]);
    expect(isSettled("done")).toBe(true);
    expect(isSettled("dropped")).toBe(true);
    expect(isSettled("held")).toBe(false);
    expect(isSettled("new")).toBe(false);
    expect(isSettled("blocked")).toBe(false);
  });
});

describe("activeDependents — walks through settled, collects active", () => {
  test("A → B → C(done) → D: activeDependents(A) = {B, D} (fixes undercount bug)", () => {
    const g = TaskGraph.from(chain());
    const result = ids(g.activeDependents("A"));
    // The old buggy traversal stopped at the done C and reported only {B}.
    expect(result).toEqual(new Set(["B", "D"]));
    // Explicitly: the done intermediate is excluded but walked through.
    expect(result.has("C")).toBe(false);
    expect(result.has("D")).toBe(true);
    expect(result).not.toEqual(new Set(["B"]));
  });

  test("excludes the queried id itself", () => {
    const g = TaskGraph.from(chain());
    expect(ids(g.activeDependents("A")).has("A")).toBe(false);
  });
});

describe("closure — bidirectional, ignores status (returns settled nodes)", () => {
  test("closure(A) includes the done C", () => {
    const g = TaskGraph.from(chain());
    const result = ids(g.closure("A"));
    expect(result).toEqual(new Set(["B", "C", "D"]));
    expect(result.has("C")).toBe(true);
  });

  test("closure excludes the queried id itself", () => {
    const g = TaskGraph.from(chain());
    expect(ids(g.closure("A")).has("A")).toBe(false);
  });

  test("includeGroups pulls in the enclosing group anchor; off omits it", () => {
    // X is grouped under G; G is otherwise unconnected to X by deps.
    const g = TaskGraph.from([node("X", "new", [], "G"), node("G", "new", [])]);
    expect(ids(g.closure("X", { includeGroups: true }))).toEqual(new Set(["G"]));
    expect(ids(g.closure("X", { includeGroups: false }))).toEqual(new Set());
  });
});

describe("activeBlockers / isBlocked — walks through settled", () => {
  test("activeBlockers(D) walks through done C to find A", () => {
    const g = TaskGraph.from(chain());
    const result = ids(g.activeBlockers("D"));
    expect(result).toEqual(new Set(["A", "B"]));
    expect(result.has("C")).toBe(false);
  });

  test("isBlocked(D) true while A active, false once all prerequisites settle", () => {
    expect(TaskGraph.from(chain("done", "new")).isBlocked("D")).toBe(true);
    // With only A also done, B (new) is still an active prerequisite → still blocked.
    expect(TaskGraph.from(chain("done", "done")).isBlocked("D")).toBe(true);
    // Settle the whole prerequisite chain (A and B both settled, C already done) →
    // no active blockers remain.
    const allSettled = [
      node("A", "done", []),
      node("B", "dropped", ["A"]),
      node("C", "done", ["B"]),
      node("D", "new", ["C"]),
    ];
    expect(TaskGraph.from(allSettled).isBlocked("D")).toBe(false);
  });
});

describe("dependsOn — structural, status-agnostic, cycle-safe", () => {
  test("dependsOn(D, A) true through the chain; dependsOn(A, D) false", () => {
    const g = TaskGraph.from(chain());
    expect(g.dependsOn("D", "A")).toBe(true);
    expect(g.dependsOn("A", "D")).toBe(false);
  });

  test("a node does not depend on itself", () => {
    const g = TaskGraph.from(chain());
    expect(g.dependsOn("A", "A")).toBe(false);
  });
});

describe("directDependents / directDependencies — single hop", () => {
  test("single-hop correctness", () => {
    const g = TaskGraph.from(chain());
    expect(ids(g.directDependents("A"))).toEqual(new Set(["B"]));
    expect(ids(g.directDependents("C"))).toEqual(new Set(["D"]));
    expect(ids(g.directDependents("D"))).toEqual(new Set());
    expect(ids(g.directDependencies("B"))).toEqual(new Set(["A"]));
    expect(ids(g.directDependencies("A"))).toEqual(new Set());
  });
});

describe("cycle safety", () => {
  // P → Q → P (mutually dependent). Not a real DAG, but must never hang.
  const cyclic = () => [node("P", "new", ["Q"]), node("Q", "new", ["P"])];

  test("dependsOn terminates on a cycle", () => {
    const g = TaskGraph.from(cyclic());
    expect(g.dependsOn("P", "Q")).toBe(true);
    expect(g.dependsOn("Q", "P")).toBe(true);
  });

  test("closure terminates on a cycle", () => {
    const g = TaskGraph.from(cyclic());
    expect(ids(g.closure("P"))).toEqual(new Set(["Q"]));
  });

  test("activeDependents terminates on a cycle (collects everything reachable, incl. P via the cycle)", () => {
    const g = TaskGraph.from(cyclic());
    // Walking P's dependents reaches Q, then Q's dependent P; both active, both
    // collected. The point is termination, not exclusion of the seed here.
    expect(ids(g.activeDependents("P"))).toEqual(new Set(["Q", "P"]));
  });
});
