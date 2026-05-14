import { MdSplitscreen } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { attemptsResource } from "@plugins/tasks/core";
import { Button } from "@/components/ui/button";
import { attemptPane } from "../panes";

export function AttemptSwitchButton() {
  const { conversation } = conversationPane.useData();
  const { data } = useResource(attemptsResource);

  const attempt = data.find((a) => a.id === conversation.attemptId) ?? null;
  const count = attempt?.conversations.length ?? 0;

  const { isOpen, toggle } = attemptPane.useToggle(
    { attemptId: conversation.attemptId },
    { action: "unwrap", side: "left" },
  );

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={isOpen ? "Close attempt view" : "Open attempt view"}
      aria-label={isOpen ? "Close attempt view" : "Open attempt view"}
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdSplitscreen className="size-4" />
      <span className="text-xs tabular-nums">{count}</span>
    </Button>
  );
}
