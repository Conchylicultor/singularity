import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { type TaskListItem } from "../core";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";
import {
  updateTask,
  setTaskAutoStart,
  clearTaskAutoStart,
} from "../core/endpoints";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

export type TaskPatch = Partial<{
  title: string;
  description: string | null;
  drop: boolean;
  hold: boolean;
  expanded: boolean;
  folderId: string | null;
  rank: Rank;
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
