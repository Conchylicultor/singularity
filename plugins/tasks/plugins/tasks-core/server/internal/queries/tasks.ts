import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { nextRankUnder, type RankExecutor } from "@plugins/primitives/plugins/rank/server";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { _taskDependencies, _tasks } from "../tables";
import { attempts, tasks } from "../views";
import type { Task } from "../schema";

export interface TaskFilters {
  excludeId?: string;
}

export async function listTasks(filters?: TaskFilters): Promise<Task[]> {
  const rows = (await db
    .select()
    .from(tasks)
    .orderBy(asc(tasks.rank), asc(tasks.createdAt))) as unknown as Task[];
  if (filters?.excludeId) {
    return rows.filter((r) => r.id !== filters.excludeId);
  }
  return rows;
}

export async function getTask(id: string): Promise<Task | null> {
  const [row] = (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)) as unknown as Task[];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}

// True iff `taskId` has at least one dependency that is neither dropped nor
// associated with a completed attempt. Held deps still block. Mirrors the
// `hasBlockingDep` SQL embedded in the `tasks_v` view's status derivation
// (schema.ts), exposed as a standalone query so the auto-start engine can
// gate launches on the same definition the UI sees.
export async function hasBlockingDep(taskId: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT EXISTS (
      SELECT 1 FROM ${_taskDependencies} td
        JOIN ${_tasks} dep ON dep.id = td.depends_on_task_id
       WHERE td.task_id = ${taskId}
         AND dep.dropped_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM ${attempts} a
            WHERE a.task_id = dep.id AND a.status = 'completed'
         )
    ) AS blocking`,
  );
  const row = result.rows[0] as { blocking?: boolean } | undefined;
  return Boolean(row?.blocking);
}

export async function findNextRankInFolder(
  folderId: string | null,
  executor: RankExecutor = db,
): Promise<Rank> {
  return nextRankUnder(_tasks, _tasks.folderId, folderId, executor);
}

// True if candidateId is a descendant of ancestorId in the folder hierarchy.
// Used to prevent circular re-filing.
export async function isDescendant(
  ancestorId: string,
  candidateId: string,
): Promise<boolean> {
  const all = await db
    .select({ id: _tasks.id, folderId: _tasks.folderId })
    .from(_tasks);
  const byId = new Map(all.map((r) => [r.id, r.folderId] as const));
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

export async function listBlockingDepIds(taskId: string): Promise<string[]> {
  const rows = await db
    .select({ depTaskId: _taskDependencies.dependsOnTaskId })
    .from(_taskDependencies)
    .innerJoin(_tasks, eq(_tasks.id, _taskDependencies.dependsOnTaskId))
    .where(
      and(
        eq(_taskDependencies.taskId, taskId),
        isNull(_tasks.droppedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ${attempts} a
           WHERE a.task_id = ${_taskDependencies.dependsOnTaskId}
             AND a.status = 'completed'
        )`,
      ),
    );
  return rows.map((r) => r.depTaskId);
}

export async function listDependentIds(taskId: string): Promise<string[]> {
  const rows = await db
    .select({ taskId: _taskDependencies.taskId })
    .from(_taskDependencies)
    .where(eq(_taskDependencies.dependsOnTaskId, taskId));
  return rows.map((r) => r.taskId);
}

export async function getTaskDependencyIds(taskId: string): Promise<string[]> {
  const rows = await db
    .select({ dependsOnTaskId: _taskDependencies.dependsOnTaskId })
    .from(_taskDependencies)
    .where(eq(_taskDependencies.taskId, taskId));
  return rows.map((r) => r.dependsOnTaskId);
}

// Armed tasks that depend on `changedTaskId`. Used by the static
// taskStatusChanged trigger to fan out maybeLaunchTaskJob enqueues.
export async function listArmedDependentsOf(
  changedTaskId: string,
): Promise<string[]> {
  const result = await db.execute<{ task_id: string }>(
    sql`SELECT DISTINCT td.task_id
        FROM ${_taskDependencies} td
        JOIN tasks_ext_auto_start tas ON tas.parent_id = td.task_id
        WHERE td.depends_on_task_id = ${changedTaskId}`,
  );
  return result.rows.map((r) => r.task_id);
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
