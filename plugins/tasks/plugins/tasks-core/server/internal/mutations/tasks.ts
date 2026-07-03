import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _attempts, _taskDependencies, _tasks } from "../tables";
import { tasks } from "../views";
import type { TaskStatus } from "../schema";
import { TaskGraph } from "../../../core";
import { findNextRankInFolder, isDescendant, listTasks, taskDependsOn } from "../queries/tasks";
import { emitStatusChangeIfChanged, readTaskStatus } from "../status-emit";
import type { DbExecutor } from "../status-batch";
import { Rank } from "@plugins/primitives/plugins/rank/core";

export const CONVERSATIONS_META_TASK_ID = "task-meta-conversations";

export interface CreateTaskInput {
  id?: string;
  // Folder the task is filed under (display-only hierarchy, not a dependency).
  folderId?: string | null;
  groupId?: string | null;
  title: string;
  // Defaults to true (machine-generated label). Pass false when the title is
  // human/agent-authored (explicit API/MCP title) so buildTaskPrompt keeps it.
  titleAuto?: boolean;
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
  // Re-file under a different folder (display-only hierarchy, not a dependency).
  folderId?: string | null;
  rank?: Rank;
}

export async function createTask(input: CreateTaskInput, exec: DbExecutor = db) {
  const id =
    input.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const folderId = input.folderId ?? null;
  const rank = input.rank ?? (await findNextRankInFolder(folderId, exec));
  await exec.insert(_tasks).values({
    id,
    folderId,
    groupId: input.groupId ?? null,
    title: input.title,
    titleAuto: input.titleAuto ?? true,
    author: input.author,
    rank: rank.toJSON(),
    description: input.description ?? null,
  });
  if (folderId) {
    await exec
      .update(_tasks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_tasks.id, folderId));
  }
  const [full] = await exec.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  // New tasks emit their first-ever status (typically "new"). Subscribers
  // bound via `where({ taskId })` only register after creation, so this
  // first emit is a no-op for them; emitting unconditionally keeps the
  // mutation/event surface uniform with updateTask.
  await emitStatusChangeIfChanged(id, null, exec);
  return full!;
}

export async function updateTask(id: string, patch: UpdateTaskPatch) {
  const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.title === "string") {
    dbPatch.title = patch.title;
    // An explicit title write is human-authored — never re-summarized into the
    // launch prompt, and protected from the Haiku CAS upgrade.
    dbPatch.titleAuto = false;
  }
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
  if (patch.folderId === null || typeof patch.folderId === "string") {
    if (patch.folderId === id) {
      throw new Error("Cannot file a task into itself");
    }
    if (patch.folderId !== null && (await isDescendant(id, patch.folderId))) {
      throw new Error("Cannot file a task into its own descendant");
    }
    dbPatch.folderId = patch.folderId;
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
  if (typeof patch.folderId === "string" && patch.folderId.length > 0) {
    await db
      .update(_tasks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_tasks.id, patch.folderId));
  }
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
    // Haiku-generated label: keep titleAuto true so the title stays out of the
    // launch prompt (it is just a summary of the description).
    .set({ title, titleAuto: true, updatedAt: new Date() })
    .where(
      and(
        eq(_tasks.id, id),
        inArray(_tasks.title, onlyIfTitleIn),
      ),
    )
    .returning({ id: _tasks.id });
  return !!updated;
}

export async function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  exec: DbExecutor = db,
): Promise<void> {
  if (dependsOnTaskId === taskId)
    throw new Error("A task cannot depend on itself");
  const [task] = await exec
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.id, taskId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!task) throw new Error("Task not found");
  const [dep] = await exec
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.id, dependsOnTaskId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!dep) throw new Error("Dependency task not found");
  // Read the cycle check on `exec` so it sees edges added earlier in the batch.
  if (await taskDependsOn(dependsOnTaskId, taskId, exec)) {
    throw new Error("Cycle detected in dependencies");
  }
  const prev = await readTaskStatus(taskId, exec);
  await exec
    .insert(_taskDependencies)
    .values({ taskId, dependsOnTaskId })
    .onConflictDoNothing();
  await emitStatusChangeIfChanged(taskId, prev, exec);
}

export async function removeTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  exec: DbExecutor = db,
): Promise<boolean> {
  const prev = await readTaskStatus(taskId, exec);
  const [row] = await exec
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
  await emitStatusChangeIfChanged(taskId, prev, exec);
  return true;
}

export async function dropTaskTree(id: string): Promise<number> {
  // Drop `id` plus every task that TRANSITIVELY depends on it and is still
  // active. The shared TaskGraph walk continues *through* settled (done/dropped)
  // intermediates to reach active nodes behind them, but never re-acts on the
  // settled nodes themselves — so already done/dropped descendants are left
  // untouched while a deep active dependent gated behind one is still dropped.
  const graph = TaskGraph.from(await listTasks());
  const ids = [...new Set([id, ...graph.activeDependents(id).map((n) => n.id)])];

  const now = new Date();
  const befores = new Map<string, TaskStatus | null>();
  for (const tid of ids) {
    befores.set(tid, await readTaskStatus(tid));
  }

  await db
    .update(_tasks)
    .set({ droppedAt: now, heldAt: null, updatedAt: now })
    .where(inArray(_tasks.id, ids));

  for (const tid of ids) {
    await emitStatusChangeIfChanged(tid, befores.get(tid) ?? null);
  }
  return ids.length;
}

// Idempotently ensures the meta-task exists. Returns true iff this call
// inserted the row (used as a one-shot signal for backfills).
export async function ensureMetaTask(id: string, title: string): Promise<boolean> {
  const rank = await findNextRankInFolder(null);
  const rows = await db
    .insert(_tasks)
    .values({ id, title, rank: rank.toJSON() })
    .onConflictDoNothing({ target: _tasks.id })
    .returning({ id: _tasks.id });
  return rows.length === 1;
}

// Re-file orphan roots that have >=1 attempt into the meta task's folder.
export async function backfillMetaParent(
  metaTaskId: string,
): Promise<number> {
  const rows = await db
    .update(_tasks)
    .set({ folderId: metaTaskId })
    .where(
      and(
        isNull(_tasks.folderId),
        ne(_tasks.id, metaTaskId),
        sql`EXISTS (SELECT 1 FROM ${_attempts} a WHERE a.task_id = ${_tasks.id})`,
      ),
    )
    .returning({ id: _tasks.id });
  return rows.length;
}
