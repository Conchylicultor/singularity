import { MdDifference } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";

export function EditedFilesButton({ conversation }: { conversation: ConversationState }) {
  const { files } = useEditedFiles(conversation.id);
  const count = files?.length ?? null;

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled
      title="Edited files (coming soon)"
      aria-label="Edited files"
      className="gap-1.5"
    >
      <MdDifference className="size-4" />
      {count !== null && <span className="tabular-nums text-xs">{count}</span>}
    </Button>
  );
}
