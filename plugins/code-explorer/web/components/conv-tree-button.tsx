import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdFolderOpen } from "react-icons/md";
import { convFileTreePane } from "../panes";

export function ConvTreeButton() {
  const { isOpen, toggle } = convFileTreePane.useToggle({});

  // No `size` → inherits the toolbar's density, matching the other action icons.
  return (
    <IconButton
      icon={MdFolderOpen}
      label="File explorer"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
