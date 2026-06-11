import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { MdTimeline } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convPushProfilingPane } from "../panes";

export function PushProfilingButton() {
  const { convId } = conversationPane.useParams();
  const { isOpen, toggle } = convPushProfilingPane.useToggle(
    { convId },
    { input: { convId } },
  );

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      title="Push profiling"
      aria-label="Push profiling"
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdTimeline className="size-4" />
    </Button>
  );
}
