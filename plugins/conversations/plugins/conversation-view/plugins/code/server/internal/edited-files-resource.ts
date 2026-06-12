import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { EditedFilesPayloadSchema } from "../../core/protocol";
import { getEditedFiles } from "./get-edited-files";
import { watchEditedFiles } from "./watch-edited-files";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();

async function worktreeFor(conversationId: string): Promise<string | null> {
  const row = await getConversation(conversationId);
  return row?.worktreePath ?? null;
}

export const editedFilesResource = defineResource({
  key: "edited-files",
  mode: "invalidate",
  schema: EditedFilesPayloadSchema,
  loader: async ({ id }: Params) => {
    const wt = await worktreeFor(id);
    if (!wt) return [];
    return getEditedFiles(wt);
  },
  async onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    const wt = await worktreeFor(id);
    if (!wt) return;
    let first = true;
    const unsub = watchEditedFiles(wt, () => {
      if (first) {
        first = false;
        return;
      }
      editedFilesResource.notify({ id });
    });
    unsubscribes.set(id, unsub);
  },
  onLastUnsubscribe({ id }: Params) {
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
  },
});
