import { tasksCategory } from "./tables";

export async function getTaskCategory(taskId: string) {
  return tasksCategory.get(taskId);
}

// Upsert when a category is given, delete when null. The live-state resource is
// invalidated by the DB change-feed so every surface re-renders.
export async function setTaskCategory(
  taskId: string,
  category: string | null,
): Promise<void> {
  if (category) {
    await tasksCategory.upsert(taskId, { category });
  } else {
    await tasksCategory.delete(taskId);
  }
}
