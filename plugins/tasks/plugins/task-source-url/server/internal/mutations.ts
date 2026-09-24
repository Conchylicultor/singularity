import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _attempts } from "@plugins/tasks/plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
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
      .select({ url: tasksSourceUrl.table.url })
      .from(_attempts)
      .innerJoin(
        tasksSourceUrl.table,
        eq(tasksSourceUrl.table.taskId, _attempts.taskId),
      )
      .where(eq(_attempts.id, params.attemptId));
    return { url: row?.url ?? null };
  },
);
