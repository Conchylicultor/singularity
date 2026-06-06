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

// Snapshot a source task's preprompt onto a destination task. Used when an agent
// spawns a subtask so it inherits the spawning agent's system prompt. No-op when
// the source has no preprompt (the subtask simply gets none).
export async function inheritTaskPreprompt(
  fromTaskId: string,
  toTaskId: string,
): Promise<void> {
  const source = await getTaskPreprompt(fromTaskId);
  if (source) await setTaskPreprompt(toTaskId, source.prepromptId);
}
