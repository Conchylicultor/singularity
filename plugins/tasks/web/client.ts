import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, type Task } from "../core";
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
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function setAutoStart(
  id: string,
  model: AutoStartModel,
): Promise<void> {
  if (model === "none") {
    await fetch(`/api/tasks/${id}/auto-start`, { method: "DELETE" });
    return;
  }
  await fetch(`/api/tasks/${id}/auto-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
}

export async function deleteTask(id: string): Promise<void> {
  await fetch(`/api/tasks/${id}`, { method: "DELETE" });
}

export function useTask(id: string | null | undefined): Task | null {
  const result = useResource(tasksResource);
  if (!id || result.pending) return null;
  return result.data.find((t) => t.id === id) ?? null;
}
