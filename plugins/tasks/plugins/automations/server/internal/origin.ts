import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@plugins/database/server";
import {
  _tasks,
  createTask,
  tasksView,
} from "@plugins/tasks/plugins/tasks-core/server";
import { setTaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { tasksOrigin } from "./tables";

const t = tasksOrigin.table;

// A task an automation filed is OPEN until it is done or dropped. Held and
// attempted-without-a-push count as open: they are a person's to look at, and
// filing a second task beside one would only duplicate it.
const isOpen = sql`${tasksView.status} NOT IN ('done', 'dropped')`;

/** The open task `automationId` filed, newest first, or `null` when none is. */
export async function openAutomationTaskId(
  automationId: string,
  exec: DbExecutor = db,
): Promise<string | null> {
  const rows = await exec
    .select({ taskId: t.taskId })
    .from(t)
    .innerJoin(tasksView, eq(tasksView.id, t.taskId))
    .where(and(eq(t.automationId, automationId), isOpen))
    .orderBy(desc(t.filedAt))
    .limit(1);
  return rows[0]?.taskId ?? null;
}

/** Every automation's open task, keyed by automation id (absent ⇒ none open). */
export async function openAutomationTaskIds(
  exec: DbExecutor = db,
): Promise<Map<string, string>> {
  const rows = await exec
    .select({ automationId: t.automationId, taskId: t.taskId })
    .from(t)
    .innerJoin(tasksView, eq(tasksView.id, t.taskId))
    .where(isOpen)
    .orderBy(desc(t.filedAt));
  const open = new Map<string, string>();
  for (const r of rows) {
    if (!open.has(r.automationId)) open.set(r.automationId, r.taskId);
  }
  return open;
}

/** The automation that filed `taskId`, or `null` when no automation did. */
export async function automationOfTask(taskId: string): Promise<string | null> {
  const row = await tasksOrigin.get(taskId);
  return row === undefined ? null : row.automationId;
}

/**
 * What an automation files: one task. Its description is the automation's
 * prompt template filled with `variables` (the registry adds `pushPolicy`).
 */
export interface AutomationFiling {
  title: string;
  /** A value for every `{{variable}}` the automation declares. */
  variables: Readonly<Record<string, string>>;
  /** The sources the task covers (stored on its origin row). */
  sourceKeys: readonly string[];
  /**
   * Called with the filed task's id once it exists — e.g. to link the records
   * it covers to it. A failure throws out of the run after the task is filed.
   */
  onFiled?: (taskId: string) => Promise<void>;
}

/**
 * File the task, stamp its category and record its origin, in ONE transaction:
 * a task without its origin row would be invisible to the dedupe, and the next
 * tick would file a second one beside it.
 */
export async function fileAutomationTask(args: {
  automationId: string;
  categoryId: string;
  filing: AutomationFiling;
  description: string;
}): Promise<string> {
  const { automationId, categoryId, filing, description } = args;
  return db.transaction(async (tx) => {
    const task = await createTask(
      {
        title: filing.title,
        titleAuto: false,
        author: `automation:${automationId}`,
        description,
      },
      tx,
    );
    await setTaskCategory(task.id, categoryId, tx);
    await tasksOrigin.upsert(
      task.id,
      {
        automationId,
        sourceKeys: [...filing.sourceKeys],
        filedAt: new Date(),
      },
      tx,
    );
    return task.id;
  });
}

/**
 * Record `automationId` as the origin of `taskIds` — tasks it filed before
 * origins were stored. Idempotent: a task that already has an origin keeps it.
 * `filedAt` is the task's own creation time. Returns how many were adopted.
 */
export async function adoptAutomationTasks(
  automationId: string,
  taskIds: readonly string[],
): Promise<number> {
  if (taskIds.length === 0) return 0;
  const tasks = await db
    .select({ id: _tasks.id, createdAt: _tasks.createdAt })
    .from(_tasks)
    .where(inArray(_tasks.id, [...taskIds]));
  if (tasks.length === 0) return 0;
  const adopted = await db
    .insert(t)
    .values(
      tasks.map((task) => ({
        taskId: task.id,
        automationId,
        sourceKeys: [],
        filedAt: task.createdAt,
      })),
    )
    .onConflictDoNothing()
    .returning({ taskId: t.taskId });
  return adopted.length;
}
