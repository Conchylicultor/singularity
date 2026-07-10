import { useResource, type ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { editedFilesResource } from "../core/resources";
import type { EditedFilesPayload } from "../core/protocol";

// The payload is a `Resolvable<EditedFile[]>`: consumers narrow on `.resolved`
// (an unresolved worktree renders its `reason`, not a fake empty list).
export function useEditedFiles(conversationId: string): ResourceResult<EditedFilesPayload> {
  return useResource(editedFilesResource, { id: conversationId });
}
