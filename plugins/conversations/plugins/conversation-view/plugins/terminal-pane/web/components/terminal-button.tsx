import { MdTerminal } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { convTerminalPane } from "../panes";

export function TerminalButton() {
  const { conversation } = conversationPane.useData();
  const { isOpen, toggle } = convTerminalPane.useToggle({ convId: conversation.id });

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Terminal"
      aria-label="Terminal"
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdTerminal className="size-4" />
    </Button>
  );
}
