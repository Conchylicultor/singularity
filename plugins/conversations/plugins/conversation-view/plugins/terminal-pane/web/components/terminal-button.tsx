import { MdTerminal } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { convTerminalPane } from "../panes";

export function TerminalButton() {
  const { convId } = conversationPane.useParams();
  const { isOpen, toggle } = convTerminalPane.useToggle({ convId }, { input: { convId } });

  // No `size` → inherits the toolbar's density, matching the other action icons.
  return (
    <IconButton
      icon={MdTerminal}
      label="Terminal"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
