import { tasksPreprompt } from "./tables";
import { taskPrepromptsResource } from "./resource";

export async function getTaskPreprompt(taskId: string) {
  return tasksPreprompt.get(taskId);
}

// Upsert when a preprompt id is given, delete when null. Notifies the
// live-state resource so every surface (draft form, task detail) re-renders.
export async function setTaskPreprompt(
  taskId: string,
  prepromptId: string | null,
): Promise<void> {
  if (prepromptId) {
    await tasksPreprompt.upsert(taskId, { prepromptId });
  } else {
    await tasksPreprompt.delete(taskId);
  }
  taskPrepromptsResource.notify();
}
