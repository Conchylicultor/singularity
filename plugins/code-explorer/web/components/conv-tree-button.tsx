import { MdFolderOpen } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@/components/ui/button";
import { convFileTreePane } from "../panes";

export function ConvTreeButton() {
  const { conversation } = conversationPane.useData();
  const match = usePaneMatch();
  const openPane = useOpenPane();
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
          : openPane(convFileTreePane, { convId: conversation.id }, { mode: "push" })
      }
    >
      <MdFolderOpen className="size-4" />
    </Button>
  );
}
