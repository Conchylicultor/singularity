import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { _tasks } from "@plugins/tasks-core/server";
import { tasksAutoStartResource } from "./resource";
import { _tasksAutoStartExt } from "./tables";

export async function getTaskAutoStart(id: string) {
  const rows = await db
    .select()
    .from(_tasksAutoStartExt)
    .where(eq(_tasksAutoStartExt.parentId, id))
    .limit(1);
  return rows[0];
}

// Write or clear the auto-start ext-table row. Pass `null` to clear.
export async function setTaskAutoStart(
  id: string,
  autoStart: { model: "opus" | "sonnet" } | null,
): Promise<boolean> {
  const [task] = await db
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.id, id))
    .limit(1);
  if (!task) return false;
  if (autoStart) {
    const now = new Date();
    await db
      .insert(_tasksAutoStartExt)
      .values({
        parentId: id,
        autoStartAt: now,
        autoStartModel: autoStart.model,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: _tasksAutoStartExt.parentId,
        set: { autoStartAt: now, autoStartModel: autoStart.model, updatedAt: now },
      });
  } else {
    await db.delete(_tasksAutoStartExt).where(eq(_tasksAutoStartExt.parentId, id));
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
  if (row) tasksAutoStartResource.notify();
  return !!row;
}
