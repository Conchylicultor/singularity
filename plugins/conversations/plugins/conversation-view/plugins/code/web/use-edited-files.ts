import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { editedFilesResource } from "../shared/resources";
import type { EditedFile } from "../shared/protocol";

export function useEditedFiles(conversationId: string): {
  files: EditedFile[] | null;
} {
  const { data } = useResource(editedFilesResource, { id: conversationId });
  return { files: data ?? null };
}
