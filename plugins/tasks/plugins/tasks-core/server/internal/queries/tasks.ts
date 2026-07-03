import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { nextRankUnder, type RankExecutor } from "@plugins/primitives/plugins/rank/server";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { _taskDependencies, _tasks } from "../tables";
import { attempts, taskBlocking, tasks } from "../views";
import type { Task } from "../schema";
import { TaskGraph } from "../../../core";
import type { DbExecutor } from "../status-batch";

export interface TaskFilters {
  excludeId?: string;
}

export async function listTasks(
  filters?: TaskFilters,
  exec: DbExecutor = db,
): Promise<Task[]> {
  const rows = (await exec
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

// True iff any task in `taskId`'s TRANSITIVE dependency closure is unresolved —
// neither dropped nor backed by a completed attempt (held deps still block).
// Reads the shared `task_blocking_v` view (see views.ts) so the auto-start gate
// and the UI status badge derive blocking from one definition rather than two
// hand-mirrored single-hop queries. A task with no row in the view has no
// dependencies → not blocked.
export async function hasBlockingDep(taskId: string): Promise<boolean> {
  const [row] = await db
    .select({ blocking: taskBlocking.hasBlockingDep })
    .from(taskBlocking)
    .where(eq(taskBlocking.taskId, taskId))
    .limit(1);
  return row?.blocking ?? false;
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

// Intentionally SINGLE-HOP DIRECT (distinct from the transitive `task_blocking_v`
// / TaskGraph.activeBlockers): callers feed the result to `rankAfterBlockers` and
// walk the frontier themselves, so this must stay the direct-dependency frontier,
// not the transitive closure. Do NOT "consolidate" it onto the transitive view.
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

export async function listDependentIds(
  taskId: string,
  exec: DbExecutor = db,
): Promise<string[]> {
  const rows = await exec
    .select({ taskId: _taskDependencies.taskId })
    .from(_taskDependencies)
    .where(eq(_taskDependencies.dependsOnTaskId, taskId));
  return rows.map((r) => r.taskId);
}

export async function getTaskDependencyIds(
  taskId: string,
  exec: DbExecutor = db,
): Promise<string[]> {
  const rows = await exec
    .select({ dependsOnTaskId: _taskDependencies.dependsOnTaskId })
    .from(_taskDependencies)
    .where(eq(_taskDependencies.taskId, taskId));
  return rows.map((r) => r.dependsOnTaskId);
}

// Armed tasks that TRANSITIVELY depend on `changedTaskId`. Used by the static
// taskStatusChanged trigger to fan out maybeLaunchTaskJob enqueues. Must be
// transitive to match hasBlockingDep: when a deep ancestor resolves, an armed
// task gated on it may sit several hops down behind an already-dropped (and so
// unarmed) intermediate — a single-hop fan-out would never re-wake it. The
// recursive walk follows depends_on edges downstream; UNION dedupes so cycles
// (barred on insert) terminate. Each wakened task still re-checks hasBlockingDep
// before launching, so over-broad fan-out is harmless.
export async function listArmedDependentsOf(
  changedTaskId: string,
): Promise<string[]> {
  const result = await db.execute<{ task_id: string }>(
    sql`WITH RECURSIVE dependents AS (
          SELECT td.task_id AS task_id
            FROM ${_taskDependencies} td
           WHERE td.depends_on_task_id = ${changedTaskId}
          UNION
          SELECT td.task_id
            FROM ${_taskDependencies} td
            JOIN dependents d ON td.depends_on_task_id = d.task_id
        )
        SELECT DISTINCT d.task_id
          FROM dependents d
          JOIN tasks_ext_auto_start tas ON tas.parent_id = d.task_id`,
  );
  return result.rows.map((r) => r.task_id);
}

// True if `start` (transitively) depends on `target`. Used to prevent
// dependency cycles before inserting `target → start`. Structural and
// status-agnostic: routes through the shared TaskGraph so the last in-process
// server walk derives from the same model as every other traversal.
export async function taskDependsOn(
  start: string,
  target: string,
  exec: DbExecutor = db,
): Promise<boolean> {
  return TaskGraph.from(await listTasks(undefined, exec)).dependsOn(start, target);
}
