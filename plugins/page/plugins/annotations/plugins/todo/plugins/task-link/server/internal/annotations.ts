import { eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { todoBlock } from "@plugins/page/plugins/annotations/plugins/todo/core";
import { tasksView } from "@plugins/tasks/plugins/tasks-core/server";
import { todoTask } from "./tables";

const t = todoTask.table;

/**
 * The `task_id` / `status` attributes of every dispatched `<todo>` card among
 * `rows` — this plugin's `Editor.BlockAnnotation` contribution.
 *
 * These two facts are the reason `markdown.tag.annotated` exists: they are about
 * the CARD but live in another table, so neither the derived attribute
 * projection (which reads `data`) nor a declared `attrs(data, ctx)` could ever
 * produce them. Emitting them is what lets an agent reading a page tell a TODO
 * somebody is already on from one nobody has touched.
 *
 * The value of `status` is the RAW `TaskStatus` enum (`new` / `in_progress` /
 * `need_action` / `attempted` / `done` / `held` / `dropped` / `blocked`), never a
 * prettified label: what an agent reads is then the same vocabulary the task
 * list shows and the task tools accept, with no second dialect to translate.
 *
 * Status is read from `tasks_v`, not from `tasks`: a task's status is COMPUTED
 * (from its attempts, its conversations, its dependencies) and is no column of
 * the base table.
 *
 * One query for the whole page, joined — the seam hands over all the rows at once
 * precisely so a provider can do that. A page with no TODO cards, or a call with
 * no rows, does no query at all rather than one that can only return nothing.
 */
export async function resolveTodoAnnotations(
  rows: readonly { id: string; type: string }[],
): Promise<ReadonlyMap<string, Record<string, string>>> {
  const byBlock = new Map<string, Record<string, string>>();
  const todoIds = rows.filter((r) => r.type === todoBlock.type).map((r) => r.id);
  if (todoIds.length === 0) return byBlock;

  const links = await db
    .select({ blockId: t.parentId, taskId: t.taskId, status: tasksView.status })
    .from(t)
    .innerJoin(tasksView, eq(tasksView.id, t.taskId))
    .where(inArray(t.parentId, todoIds));

  for (const link of links) {
    byBlock.set(link.blockId, { task_id: link.taskId, status: link.status });
  }
  return byBlock;
}
