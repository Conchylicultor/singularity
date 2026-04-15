import { defineResource } from "../../../../../../../../server/src/resources";
import { worktreePathForSync } from "../../../../../../server/internal/worktree";
import { getEditedFiles } from "./get-edited-files";
import { watchEditedFiles } from "./watch-edited-files";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();

export const editedFilesResource = defineResource({
  key: "edited-files",
  mode: "invalidate",
  loader: async ({ id }: Params) => getEditedFiles(worktreePathForSync(id)),
  onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    let first = true;
    const unsub = watchEditedFiles(worktreePathForSync(id), () => {
      // Skip the synchronous initial fire — the resource loader already
      // delivers the first snapshot to subscribers.
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
