import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { convTerminalPane } from "../panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

const terminalIcon = symbol("terminal");

export function TerminalButton() {
  const { isOpen, toggle } = convTerminalPane.useToggle({});

  // No `size` → inherits the toolbar's density, matching the other action icons.
  return (
    <IconButton
      icon={terminalIcon}
      label="Terminal"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
