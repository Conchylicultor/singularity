import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { editedFilesResource } from "../core/resources";
import type { EditedFile } from "../core/protocol";

export function useEditedFiles(conversationId: string): {
  files: EditedFile[];
} {
  const result = useResource(editedFilesResource, { id: conversationId });
  if (result.pending) return { files: [] };
  return { files: result.data };
}
