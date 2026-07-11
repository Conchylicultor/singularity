import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdFolderOpen } from "react-icons/md";
import { convFileTreePane } from "../panes";

export function ConvTreeButton() {
  const { isOpen, toggle } = convFileTreePane.useToggle({});

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      title="File explorer"
      aria-label="File explorer"
      aria-pressed={isOpen}
      onClick={toggle}
    >
      <MdFolderOpen className="size-4" />
    </Button>
  );
}
