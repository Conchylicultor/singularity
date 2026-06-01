import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _tasks } from "@plugins/tasks-core/server";
import { tasksAutoStartResource } from "./resource";
import { tasksAutoStart, _tasksAutoStartExt } from "./tables";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

export async function getTaskAutoStart(id: string) {
  return tasksAutoStart.get(id);
}

export async function setTaskAutoStart(
  id: string,
  autoStart: { model: ConversationModel } | null,
): Promise<boolean> {
  const [task] = await db
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!task) return false;
  if (autoStart) {
    const now = new Date();
    await tasksAutoStart.upsert(id, {
      autoStartAt: now,
      autoStartModel: autoStart.model,
    });
  } else {
    await tasksAutoStart.delete(id);
  }
  tasksAutoStartResource.notify();
  return true;
}

// Atomic CAS: delete the ext-table row and return true iff this caller
// won the race. Collapses at-least-once trigger delivery into exactly-one
// launch in maybeLaunchTaskJob.
export async function claimAutoStart(id: string): Promise<boolean> {
  const [row] = await db
    .delete(_tasksAutoStartExt)
    .where(eq(_tasksAutoStartExt.parentId, id))
    .returning({ parentId: _tasksAutoStartExt.parentId });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (row) tasksAutoStartResource.notify();
  return !!row;
}
