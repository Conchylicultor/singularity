import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdFolderOpen } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFileTreePane } from "../panes";

export function ConvTreeButton() {
  const { convId } = conversationPane.useParams();
  const { isOpen, toggle } = convFileTreePane.useToggle({}, { input: { convId } });

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
