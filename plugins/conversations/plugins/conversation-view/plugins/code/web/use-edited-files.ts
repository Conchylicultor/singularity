import { useLive } from "@plugins/network/plugins/live/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { editedFiles } from "../core";
import type { EditedFilesPayload } from "../core";

// The payload is a `Resolvable<EditedFile[]>`: consumers narrow on `.resolved`
// (an unresolved worktree renders its `reason`, not a fake empty list).
export function useEditedFiles(
  conversationId: string,
): ResourceResult<EditedFilesPayload> {
  return useLive(editedFiles, { id: conversationId });
}
