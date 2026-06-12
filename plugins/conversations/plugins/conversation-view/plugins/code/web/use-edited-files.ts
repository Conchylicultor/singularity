import { useResource, type ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { editedFilesResource } from "../core/resources";
import type { EditedFile } from "../core/protocol";

export function useEditedFiles(conversationId: string): ResourceResult<EditedFile[]> {
  return useResource(editedFilesResource, { id: conversationId });
}
