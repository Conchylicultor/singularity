import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _attempts, _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { splitUiContext } from "@plugins/primitives/plugins/ui-context/core";
import { getAttemptSourceUrl } from "../../core";
import { tasksSourceUrl } from "./tables";

export async function setTaskSourceUrl(
  taskId: string,
  url: string,
): Promise<void> {
  await tasksSourceUrl.upsert(taskId, { url });
}

export const handleGetAttemptSourceUrl = implement(
  getAttemptSourceUrl,
  async ({ params }) => {
    const [row] = await db
      .select({
        url: tasksSourceUrl.table.url,
        description: _tasks.description,
      })
      .from(_attempts)
      .innerJoin(_tasks, eq(_tasks.id, _attempts.taskId))
      .leftJoin(
        tasksSourceUrl.table,
        eq(tasksSourceUrl.table.taskId, _attempts.taskId),
      )
      .where(eq(_attempts.id, params.attemptId));
    return {
      url: row?.url ?? uiContextUrl(row?.description ?? null),
    };
  },
);

/**
 * The page the first `<ui-context>` in a task's prompt was picked on. A task
 * filed with no page URL but with a picked element (the Improve element
 * picker, or an agent quoting one into `add_task`) was still filed about that
 * page, so "Open app" lands there rather than on `/`.
 */
function uiContextUrl(description: string | null): string | null {
  if (!description) return null;
  for (const segment of splitUiContext(description)) {
    if (segment.kind === "tag") return segment.meta.url;
  }
  return null;
}
