import { db, type DbExecutor } from "@plugins/database/server";
import { tasksCategory } from "./tables";

export async function getTaskCategory(taskId: string) {
  return tasksCategory.get(taskId);
}

// Upsert when a category is given, delete when null. The live-state resource is
// invalidated by the DB change-feed so every surface re-renders.
//
// `exec` lets a caller that creates the task in a transaction categorize it in
// that same transaction — the pool cannot see an uncommitted task row, so the
// side-table's FK to it would fail there.
export async function setTaskCategory(
  taskId: string,
  category: string | null,
  exec: DbExecutor = db,
): Promise<void> {
  if (category) {
    await tasksCategory.upsert(taskId, { category }, exec);
  } else {
    await tasksCategory.delete(taskId, exec);
  }
}
