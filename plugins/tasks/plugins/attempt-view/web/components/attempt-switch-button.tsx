import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdSplitscreen } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { attemptsResource } from "@plugins/tasks/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { attemptPane } from "../panes";

export function AttemptSwitchButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const result = useResource(attemptsResource);

  const { isOpen, toggle } = attemptPane.useToggle(
    { attemptId: conversation?.attemptId ?? "" },
    { action: "unwrap", side: "left", input: { convId } },
  );

  // Render a neutral button (no count chip) while the resource is still loading —
  // the variant and toggle are data-independent so the button is usable immediately.
  if (result.pending) {
    return (
      <Button
        variant={isOpen ? "secondary" : "ghost"}
        size="sm"
        title={isOpen ? "Close attempt view" : "Open attempt view"}
        aria-label={isOpen ? "Close attempt view" : "Open attempt view"}
        aria-pressed={isOpen}
        onClick={toggle}
      >
        <MdSplitscreen className="size-4" />
      </Button>
    );
  }

  const attempt = result.data.find((a) => a.id === conversation?.attemptId) ?? null;
  const count = attempt?.conversations.length ?? 0;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={isOpen ? "Close attempt view" : "Open attempt view"}
      aria-label={isOpen ? "Close attempt view" : "Open attempt view"}
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-xs"
    >
      <MdSplitscreen className="size-4" />
      <Text as="span" variant="caption" className="tabular-nums">
        {count}
      </Text>
    </Button>
  );
}
