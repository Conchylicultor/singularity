import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _attempts, _taskDependencies, _tasks } from "../tables";
import { tasks } from "../schema";
import type { TaskStatus } from "../schema";
import { tasksResource } from "../resources";
import { findNextRankUnder, isDescendant, taskDependsOn } from "../queries/tasks";
import { emitStatusChangeIfChanged, readTaskStatus } from "../status-emit";
import { Rank } from "@plugins/primitives/plugins/rank/core";

export const CONVERSATIONS_META_TASK_ID = "task-meta-conversations";

export interface CreateTaskInput {
  id?: string;
  parentId?: string | null;
  groupId?: string | null;
  title: string;
  author?: string;
  rank?: Rank;
  description?: string | null;
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string | null;
  drop?: boolean;
  hold?: boolean;
  expanded?: boolean;
  parentId?: string | null;
  rank?: Rank;
}

export async function createTask(input: CreateTaskInput) {
  const id =
    input.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = input.parentId ?? null;
  const rank = input.rank ?? (await findNextRankUnder(parentId));
  await db.insert(_tasks).values({
    id,
    parentId,
    groupId: input.groupId ?? null,
    title: input.title,
    author: input.author,
    rank: rank.toJSON(),
    description: input.description ?? null,
  });
  if (parentId) {
    await db
      .update(_tasks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_tasks.id, parentId));
  }
  tasksResource.notify();
  const [full] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  // New tasks emit their first-ever status (typically "new"). Subscribers
  // bound via `where({ taskId })` only register after creation, so this
  // first emit is a no-op for them; emitting unconditionally keeps the
  // mutation/event surface uniform with updateTask.
  await emitStatusChangeIfChanged(id, null);
  return full!;
}

export async function updateTask(id: string, patch: UpdateTaskPatch) {
  const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.title === "string") dbPatch.title = patch.title;
  if (patch.description === null || typeof patch.description === "string") {
    dbPatch.description = patch.description;
  }
  if (typeof patch.drop === "boolean") {
    dbPatch.droppedAt = patch.drop ? new Date() : null;
    if (patch.drop) dbPatch.heldAt = null;
  }
  if (typeof patch.hold === "boolean") {
    dbPatch.heldAt = patch.hold ? new Date() : null;
    if (patch.hold) dbPatch.droppedAt = null;
  }
  if (typeof patch.expanded === "boolean") dbPatch.expanded = patch.expanded;
  if (patch.parentId === null || typeof patch.parentId === "string") {
    if (patch.parentId === id) {
      throw new Error("Cannot parent a task to itself");
    }
    if (patch.parentId !== null && (await isDescendant(id, patch.parentId))) {
      throw new Error("Cannot parent a task under its own descendant");
    }
    dbPatch.parentId = patch.parentId;
  }
  if (patch.rank instanceof Rank) {
    dbPatch.rank = patch.rank.toJSON();
  }
  // Snapshot status before the write so we can detect a flip
  // (typical: drop/hold transitions).
  const before = await readTaskStatus(id);
  const [updated] = await db
    .update(_tasks)
    .set(dbPatch)
    .where(eq(_tasks.id, id))
    .returning({ id: _tasks.id });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) return null;
  if (typeof patch.parentId === "string" && patch.parentId.length > 0) {
    await db
      .update(_tasks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_tasks.id, patch.parentId));
  }
  tasksResource.notify();
  await emitStatusChangeIfChanged(id, before);
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}

export async function updateTaskTitle(
  id: string,
  title: string,
  onlyIfTitleIn: string[],
): Promise<boolean> {
  const [updated] = await db
    .update(_tasks)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(_tasks.id, id),
        inArray(_tasks.title, onlyIfTitleIn),
      ),
    )
    .returning({ id: _tasks.id });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (updated) tasksResource.notify();
  return !!updated;
}

export async function deleteTask(id: string): Promise<boolean> {
  const children = await db
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.parentId, id))
    .limit(1);
  if (children.length > 0) throw new Error("Task has children");

  // Collect edges to bridge before cascade wipes them.
  const upstreamRows = await db
    .select({ dependsOnTaskId: _taskDependencies.dependsOnTaskId })
    .from(_taskDependencies)
    .where(eq(_taskDependencies.taskId, id));
  const downstreamRows = await db
    .select({ taskId: _taskDependencies.taskId })
    .from(_taskDependencies)
    .where(eq(_taskDependencies.dependsOnTaskId, id));

  const upstreamIds = upstreamRows.map((r) => r.dependsOnTaskId);
  const downstreamIds = downstreamRows.map((r) => r.taskId);

  // Snapshot statuses before cascade removes blocking edges.
  const prevStatuses = new Map<string, TaskStatus | null>();
  for (const downId of downstreamIds) {
    prevStatuses.set(downId, await readTaskStatus(downId));
  }

  const [row] = await db.delete(_tasks).where(eq(_tasks.id, id)).returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return false;
  tasksResource.notify();

  // Bridge: for each downstream Z and upstream X, add Z depends-on X.
  const bridgedDownstream = new Set<string>();
  for (const downId of downstreamIds) {
    for (const upId of upstreamIds) {
      try {
        await addTaskDependency(downId, upId);
        bridgedDownstream.add(downId);
      } catch (err) {
        if (err instanceof Error && /Cycle detected|already depends/.test(err.message)) continue;
        throw err;
      }
    }
  }

  // Emit status change for downstream tasks that got no bridge
  // (their only blocker was the deleted task, they may now be unblocked).
  for (const downId of downstreamIds) {
    if (!bridgedDownstream.has(downId)) {
      await emitStatusChangeIfChanged(downId, prevStatuses.get(downId) ?? null);
    }
  }

  return true;
}

export async function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<void> {
  if (dependsOnTaskId === taskId)
    throw new Error("A task cannot depend on itself");
  const [task] = await db
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.id, taskId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!task) throw new Error("Task not found");
  const [dep] = await db
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.id, dependsOnTaskId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!dep) throw new Error("Dependency task not found");
  if (await taskDependsOn(dependsOnTaskId, taskId)) {
    throw new Error("Cycle detected in dependencies");
  }
  const prev = await readTaskStatus(taskId);
  await db
    .insert(_taskDependencies)
    .values({ taskId, dependsOnTaskId })
    .onConflictDoNothing();
  tasksResource.notify();
  await emitStatusChangeIfChanged(taskId, prev);
}

export async function removeTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<boolean> {
  const prev = await readTaskStatus(taskId);
  const [row] = await db
    .delete(_taskDependencies)
    .where(
      and(
        eq(_taskDependencies.taskId, taskId),
        eq(_taskDependencies.dependsOnTaskId, dependsOnTaskId),
      ),
    )
    .returning({ taskId: _taskDependencies.taskId });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return false;
  tasksResource.notify();
  await emitStatusChangeIfChanged(taskId, prev);
  return true;
}

export async function dropTaskTree(id: string): Promise<number> {
  const allDeps = await db
    .select({
      taskId: _taskDependencies.taskId,
      dependsOnTaskId: _taskDependencies.dependsOnTaskId,
    })
    .from(_taskDependencies);
  const dependentsOf = new Map<string, string[]>();
  for (const row of allDeps) {
    const list = dependentsOf.get(row.dependsOnTaskId);
    if (list) list.push(row.taskId);
    else dependentsOf.set(row.dependsOnTaskId, [row.taskId]);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    ids.push(cur);
    const deps = dependentsOf.get(cur);
    if (deps) stack.push(...deps);
  }

  const now = new Date();
  const befores = new Map<string, TaskStatus | null>();
  for (const tid of ids) {
    befores.set(tid, await readTaskStatus(tid));
  }

  await db
    .update(_tasks)
    .set({ droppedAt: now, heldAt: null, updatedAt: now })
    .where(inArray(_tasks.id, ids));

  tasksResource.notify();

  for (const tid of ids) {
    await emitStatusChangeIfChanged(tid, befores.get(tid) ?? null);
  }
  return ids.length;
}

// Idempotently ensures the meta-task exists. Returns true iff this call
// inserted the row (used as a one-shot signal for backfills).
export async function ensureMetaTask(id: string, title: string): Promise<boolean> {
  const rank = await findNextRankUnder(null);
  const rows = await db
    .insert(_tasks)
    .values({ id, title, rank: rank.toJSON() })
    .onConflictDoNothing({ target: _tasks.id })
    .returning({ id: _tasks.id });
  return rows.length === 1;
}

// Re-parent orphan roots that have >=1 attempt under the meta task.
export async function backfillMetaParent(
  metaTaskId: string,
): Promise<number> {
  const rows = await db
    .update(_tasks)
    .set({ parentId: metaTaskId })
    .where(
      and(
        isNull(_tasks.parentId),
        ne(_tasks.id, metaTaskId),
        sql`EXISTS (SELECT 1 FROM ${_attempts} a WHERE a.task_id = ${_tasks.id})`,
      ),
    )
    .returning({ id: _tasks.id });
  if (rows.length > 0) tasksResource.notify();
  return rows.length;
}
