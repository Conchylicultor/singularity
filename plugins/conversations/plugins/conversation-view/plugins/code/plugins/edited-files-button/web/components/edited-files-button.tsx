import { MdDifference } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import {
  Conversation,
  useMiddlePane,
} from "@plugins/conversations/plugins/conversation-view/web/commands";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";
import {
  editedFileListPane,
  EDITED_FILE_LIST_PANE_ID,
} from "../../../file-list/web/views";

export function EditedFilesButton({ conversation }: { conversation: ConversationState }) {
  const { files } = useEditedFiles(conversation.id);
  const count = files?.length ?? null;
  const current = useMiddlePane();
  const isOpen = current?.id === EDITED_FILE_LIST_PANE_ID;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Edited files"
      aria-label="Edited files"
      aria-pressed={isOpen}
      onClick={() => Conversation.OpenMiddlePane(isOpen ? null : editedFileListPane())}
      className="gap-1.5"
    >
      <MdDifference className="size-4" />
      {count !== null && <span className="tabular-nums text-xs">{count}</span>}
    </Button>
  );
}
