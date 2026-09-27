import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { convFileTreePane } from "../panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

const folderOpenIcon = symbol("folder-open");

export function ConvTreeButton() {
  const { isOpen, toggle } = convFileTreePane.useToggle({});

  // No `size` → inherits the toolbar's density, matching the other action icons.
  return (
    <IconButton
      icon={folderOpenIcon}
      label="File explorer"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
