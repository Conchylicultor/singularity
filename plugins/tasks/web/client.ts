import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { tasksResource, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import {
  updateTask,
  setTaskAutoStart,
  clearTaskAutoStart,
} from "../core/endpoints";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

// No `rank`: repositioning goes through the `moveTask` endpoint, which carries
// positional intent and mints the rank server-side against the complete sibling
// set. A client only ever holds a projection of that set.
export type TaskPatch = Partial<{
  title: string;
  description: string | null;
  drop: boolean;
  hold: boolean;
  folderId: string | null;
}>;

export type AutoStartModel = ConversationModel | "none";

export async function patchTask(id: string, patch: TaskPatch): Promise<void> {
  await fetchEndpoint(updateTask, { id }, { body: patch });
}

export async function setAutoStart(
  id: string,
  model: AutoStartModel,
): Promise<void> {
  if (model === "none") {
    await fetchEndpoint(clearTaskAutoStart, { id });
    return;
  }
  await fetchEndpoint(setTaskAutoStart, { id }, { body: { model } });
}

export function useTask(id: string | null | undefined): TaskListItem | null {
  const result = useResource(tasksResource);
  if (!id || result.pending) return null;
  return result.data.find((t) => t.id === id) ?? null;
}
