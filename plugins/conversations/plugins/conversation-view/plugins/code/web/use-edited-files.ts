import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { editedFilesResource } from "../core/resources";
import type { EditedFile } from "../core/protocol";

export function useEditedFiles(conversationId: string): {
  files: EditedFile[];
} {
  const { data } = useResource(editedFilesResource, { id: conversationId });
  return { files: data };
}
