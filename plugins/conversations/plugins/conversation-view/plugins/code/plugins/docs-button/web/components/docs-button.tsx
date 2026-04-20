import { MdArticle } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ConversationCommands as Conversation,
  useRightPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";
import { docsRightPane, DOCS_PANE_ID, isDocFile } from "../views";

export function DocsButton({ conversation }: { conversation: ConversationState }) {
  const { files } = useEditedFiles(conversation.id);
  const current = useRightPane();
  const isOpen = current?.id === DOCS_PANE_ID;

  const docs = files?.filter((f) => isDocFile(f.path)) ?? null;
  const count = docs?.length ?? 0;
  const disabled = docs != null && count === 0;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Design docs"
      aria-label="Design docs"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={() => Conversation.OpenRightPane(isOpen ? null : docsRightPane())}
      className="gap-1.5"
    >
      <MdArticle className="size-4" />
      {docs !== null && <span className="tabular-nums text-xs">{count}</span>}
    </Button>
  );
}
