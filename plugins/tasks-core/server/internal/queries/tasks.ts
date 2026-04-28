import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { _taskDependencies, _tasks } from "../tables";
import { tasks } from "../schema";
import type { Task } from "../schema";

export interface TaskFilters {
  excludeId?: string;
}

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function listTasks(filters?: TaskFilters): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .orderBy(asc(tasks.rank), asc(tasks.createdAt));
  if (filters?.excludeId) {
    return rows.filter((r) => r.id !== filters.excludeId);
  }
  return rows;
}

export async function getTask(id: string): Promise<Task | null> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row ?? null;
}

// Children of `parentId` whose autoStart has not yet been consumed. The
// queued-children launcher in the conversations plugin reads this to know
// which tasks to spawn when the parent reaches a terminal state.
export async function listAutoStartChildren(parentId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentId, parentId), isNotNull(tasks.autoStartAt)))
    .orderBy(asc(tasks.rank), asc(tasks.createdAt));
}

export async function findNextRankUnder(
  parentId: string | null,
  executor: Executor = db,
): Promise<string> {
  const [last] = await executor
    .select({ rank: _tasks.rank })
    .from(_tasks)
    .where(
      parentId === null ? isNull(_tasks.parentId) : eq(_tasks.parentId, parentId),
    )
    .orderBy(desc(_tasks.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

// True if candidateId is a descendant of ancestorId in the parent hierarchy.
// Used to prevent circular reparenting.
export async function isDescendant(
  ancestorId: string,
  candidateId: string,
): Promise<boolean> {
  const all = await db
    .select({ id: _tasks.id, parentId: _tasks.parentId })
    .from(_tasks);
  const byId = new Map(all.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur) ?? null;
  }
  return false;
}

// True if `start` (transitively) depends on `target`. Used to prevent
// dependency cycles before inserting `target → start`.
export async function taskDependsOn(start: string, target: string): Promise<boolean> {
  const all = await db
    .select({
      taskId: _taskDependencies.taskId,
      dependsOnTaskId: _taskDependencies.dependsOnTaskId,
    })
    .from(_taskDependencies);
  const edges = new Map<string, string[]>();
  for (const e of all) {
    const list = edges.get(e.taskId);
    if (list) list.push(e.dependsOnTaskId);
    else edges.set(e.taskId, [e.dependsOnTaskId]);
  }
  const stack = [start];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = edges.get(cur);
    if (next) stack.push(...next);
  }
  return false;
}
