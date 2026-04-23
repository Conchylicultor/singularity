import { MdFolderOpen } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { usePaneMatch } from "@plugins/pane/web";
import { Button } from "@/components/ui/button";
import { convFileTreePane } from "../panes";

export function ConvTreeButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convFileTreePane._internal) ?? false;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="File explorer"
      aria-label="File explorer"
      aria-pressed={isOpen}
      onClick={() =>
        isOpen
          ? convFileTreePane.close()
          : convFileTreePane.open({ convId: conversation.id })
      }
    >
      <MdFolderOpen className="size-4" />
    </Button>
  );
}
