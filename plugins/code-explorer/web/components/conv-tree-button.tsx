import { MdFolderOpen } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { convFileTreePane } from "../panes";

export function ConvTreeButton() {
  const { conversation } = conversationPane.useData();
  const { isOpen, toggle } = convFileTreePane.useToggle({ convId: conversation.id });

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="File explorer"
      aria-label="File explorer"
      aria-pressed={isOpen}
      onClick={toggle}
    >
      <MdFolderOpen className="size-4" />
    </Button>
  );
}
