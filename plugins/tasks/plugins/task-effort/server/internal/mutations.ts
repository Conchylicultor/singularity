import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import { tasksEffort } from "./tables";

export async function getTaskEffort(taskId: string) {
  return tasksEffort.get(taskId);
}

// Upsert when a level is given, delete when null. The live-state resource is
// invalidated by the DB change-feed so every surface re-renders.
export async function setTaskEffort(
  taskId: string,
  level: EffortLevel | null,
): Promise<void> {
  if (level) {
    await tasksEffort.upsert(taskId, { level });
  } else {
    await tasksEffort.delete(taskId);
  }
}

// Snapshot a source task's thinking mode onto a destination task. Used when an
// agent spawns a subtask so it inherits the spawning agent's effort. No-op when
// the source has none (the subtask simply gets the default).
export async function inheritTaskEffort(
  fromTaskId: string,
  toTaskId: string,
): Promise<void> {
  const source = await getTaskEffort(fromTaskId);
  if (source) await setTaskEffort(toTaskId, source.level);
}
