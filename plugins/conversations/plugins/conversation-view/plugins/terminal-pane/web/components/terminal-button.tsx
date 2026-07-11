import { MdTerminal } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { convTerminalPane } from "../panes";

export function TerminalButton() {
  const { isOpen, toggle } = convTerminalPane.useToggle({});

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
