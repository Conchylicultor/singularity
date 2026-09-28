import { useLive } from "@plugins/network/plugins/live/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { editedFiles } from "../core";
import type { EditedFilesPayload } from "../core";

// The payload is a `Resolvable<EditedFile[]>`: consumers narrow on `.resolved`
// (an unresolved worktree renders its `reason`, not a fake empty list).
// A `null` id (no conversation in the route yet) reads nothing and stays
// pending — `useLive(value, null)`.
export function useEditedFiles(
  conversationId: string | null,
): ResourceResult<EditedFilesPayload> {
  return useLive(
    editedFiles,
    conversationId === null ? null : { id: conversationId },
  );
}
