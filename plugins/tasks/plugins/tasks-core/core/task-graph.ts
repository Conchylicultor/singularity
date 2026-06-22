import type { TaskListItem, TaskStatus } from "../server/internal/schema";

// A task is "settled" iff it is done or dropped: it neither blocks its dependents
// nor is blocked by its dependencies. `held` is NOT settled. The single rule,
// applied identically in both directions:
//
//   Settled tasks are walked *through* but never acted on — never counted as a
//   dependent, never treated as a blocker. The walk continues through a settled
//   node to reach the active nodes behind it.
//
// This is the SQL-free embodiment of the same predicate `task_blocking_v` derives
// from raw columns; both must agree.
export const SETTLED_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["done", "dropped"]);

export function isSettled(status: TaskStatus): boolean {
  return SETTLED_STATUSES.has(status);
}

// Minimal node shape so both client `TaskListItem[]` rows and server `tasks_v`
// rows satisfy it. The edge `dependencies` points dependent → dependency
// ("this task depends on these"): so the *reverse* of a `dependencies` edge is
// "tasks that depend on me" (my dependents).
export type TaskNode = Pick<TaskListItem, "id" | "status" | "dependencies" | "groupId">;

type WalkDirection = "dependencies" | "dependents";

/**
 * Pure value object over the task dependency DAG. Build adjacency (forward +
 * reverse) and the id index ONCE via {@link TaskGraph.from}; the instance is
 * immutable afterwards. Every traversal — badge counts, drop sets, the launch
 * gate, cycle checks, the graph view — derives from this one model so they can
 * never again disagree on whether to walk through settled nodes.
 */
export class TaskGraph {
  // forward[id] = ids this task depends on (its prerequisites / blockers)
  readonly #forward: ReadonlyMap<string, readonly string[]>;
  // reverse[id] = ids that depend on this task (its dependents)
  readonly #reverse: ReadonlyMap<string, readonly string[]>;
  readonly #byId: ReadonlyMap<string, TaskNode>;

  private constructor(
    byId: ReadonlyMap<string, TaskNode>,
    forward: ReadonlyMap<string, readonly string[]>,
    reverse: ReadonlyMap<string, readonly string[]>,
  ) {
    this.#byId = byId;
    this.#forward = forward;
    this.#reverse = reverse;
  }

  static from(tasks: readonly TaskNode[]): TaskGraph {
    const byId = new Map<string, TaskNode>();
    const forward = new Map<string, string[]>();
    const reverse = new Map<string, string[]>();
    for (const t of tasks) byId.set(t.id, t);
    for (const t of tasks) {
      // Only keep edges to nodes that exist in this graph, so adjacency never
      // points at a missing id (e.g. a dependency on a row filtered out of the
      // current task list).
      const deps = t.dependencies.filter((d) => byId.has(d));
      forward.set(t.id, deps);
      for (const d of deps) {
        const list = reverse.get(d);
        if (list) list.push(t.id);
        else reverse.set(d, [t.id]);
      }
    }
    return new TaskGraph(byId, forward, reverse);
  }

  get(id: string): TaskNode | undefined {
    return this.#byId.get(id);
  }

  /** This task's direct prerequisites (the ids in `task.dependencies`). */
  directDependencies(id: string): TaskNode[] {
    return this.#neighbors(this.#forward.get(id));
  }

  /** Tasks that directly depend on `id` (one hop along reverse edges). */
  directDependents(id: string): TaskNode[] {
    return this.#neighbors(this.#reverse.get(id));
  }

  /**
   * Transitive dependents of `id` that are still active. Walks *through* settled
   * intermediates to reach active nodes behind them, collecting only non-settled
   * nodes. Drives the "N tasks blocked on this" badge and the drop set.
   */
  activeDependents(id: string): TaskNode[] {
    return this.#walk(id, "dependents", (t) => !isSettled(t.status));
  }

  /**
   * Transitive blockers of `id` that are still active. Mirrors `task_blocking_v`:
   * walks through settled prerequisites and collects only the active ones.
   */
  activeBlockers(id: string): TaskNode[] {
    return this.#walk(id, "dependencies", (t) => !isSettled(t.status));
  }

  /** True iff `id` has at least one active (transitive) blocker. */
  isBlocked(id: string): boolean {
    return this.activeBlockers(id).length > 0;
  }

  /**
   * Structural transitive reachability over dependency edges, ignoring status:
   * does `start` (transitively) depend on `target`? Used by the server cycle
   * check. Cycle-safe via a visited set.
   */
  dependsOn(start: string, target: string): boolean {
    if (start === target) return false;
    const visited = new Set<string>();
    const stack = [...(this.#forward.get(start) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const next = this.#forward.get(cur);
      if (next) stack.push(...next);
    }
    return false;
  }

  /**
   * Bidirectional reachability from `id` over both dependency and dependent
   * edges, ignoring status (so settled nodes ARE returned — the graph view keeps
   * rendering them with strikethrough / success-tone edges). With
   * `includeGroups` (default true) the walk also follows `groupId` edges so a
   * task's enclosing group(s) are pulled into the closure. Excludes `id` itself.
   */
  closure(id: string, opts?: { includeGroups?: boolean }): TaskNode[] {
    const includeGroups = opts?.includeGroups ?? true;
    const visited = new Set<string>();
    const result: TaskNode[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = this.#byId.get(cur);
      if (!node) continue;
      if (cur !== id) result.push(node);
      for (const d of this.#forward.get(cur) ?? []) stack.push(d);
      for (const r of this.#reverse.get(cur) ?? []) stack.push(r);
      if (includeGroups && node.groupId && this.#byId.has(node.groupId)) {
        stack.push(node.groupId);
      }
    }
    return result;
  }

  /**
   * Shared traversal: always walks *through* settled nodes, collecting only the
   * nodes that pass `collect`. Excludes the queried `id` itself. The single
   * implementation behind every active-vs-settled traversal — the fix for the
   * old code that halted at settled intermediates.
   */
  #walk(id: string, direction: WalkDirection, collect: (t: TaskNode) => boolean): TaskNode[] {
    const adjacency = direction === "dependents" ? this.#reverse : this.#forward;
    const visited = new Set<string>();
    const result: TaskNode[] = [];
    const stack = [...(adjacency.get(id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = this.#byId.get(cur);
      if (!node) continue;
      if (collect(node)) result.push(node);
      // Continue *through* this node regardless of its status, so a settled
      // intermediate never severs the chain to active nodes beyond it.
      for (const next of adjacency.get(cur) ?? []) stack.push(next);
    }
    return result;
  }

  #neighbors(ids: readonly string[] | undefined): TaskNode[] {
    if (!ids) return [];
    const out: TaskNode[] = [];
    for (const id of ids) {
      const node = this.#byId.get(id);
      if (node) out.push(node);
    }
    return out;
  }
}
