import { useMemo } from "react";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web/use-edited-files";
import type {
  EditedFile,
  EditedFileStatus,
} from "@plugins/conversations/plugins/conversation-view/plugins/code/shared/protocol";
import { FileRow } from "./file-row";

const ORDER: Record<EditedFileStatus, number> = {
  modified: 0,
  added: 1,
  untracked: 2,
  deleted: 3,
};

export function EditedFileList({
  conversation,
}: {
  conversation: ConversationState;
}) {
  const { files } = useEditedFiles(conversation.id);

  const sorted = useMemo(() => {
    if (!files) return null;
    return [...files].sort(
      (a, b) => ORDER[a.status] - ORDER[b.status] || a.path.localeCompare(b.path),
    );
  }, [files]);

  if (sorted && sorted.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        No edited files
      </div>
    );
  }

  return (
    <div className="py-1">
      {sorted?.map((f: EditedFile) => (
        <FileRow key={f.path} path={f.path} status={f.status} />
      ))}
    </div>
  );
}
