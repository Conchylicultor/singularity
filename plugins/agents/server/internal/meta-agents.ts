import { db } from "../../../../server/src/db/client";
import { _tasks, nextRankUnder } from "@plugins/tasks/server";

export const AGENTS_META_TASK_ID = "task-meta-agents";
const TITLE = "Agents";

// Idempotent root task that groups every agent-launched task under one
// collapsible node in the Tasks tree (same pattern as the Conversations
// meta task).
export async function ensureAgentsMetaTask(): Promise<void> {
  const rank = await nextRankUnder(null);
  await db
    .insert(_tasks)
    .values({ id: AGENTS_META_TASK_ID, title: TITLE, rank })
    .onConflictDoNothing({ target: _tasks.id });
}
