import { MdTerminal } from "react-icons/md";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { convTerminalPane } from "../panes";

export function TerminalButton() {
  const { conversation } = conversationPane.useData();
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const isOpen =
    match?.chain.some((e) => e.pane === convTerminalPane._internal) ?? false;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Terminal"
      aria-label="Terminal"
      aria-pressed={isOpen}
      onClick={() =>
        isOpen
          ? convTerminalPane.close()
          : openPane(convTerminalPane, { convId: conversation.id }, { mode: "push" })
      }
      className="gap-1.5"
    >
      <MdTerminal className="size-4" />
    </Button>
  );
}
