import { MdSplitscreen } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { attemptsResource } from "@plugins/tasks/shared";
import { Button } from "@/components/ui/button";
import { attemptPane, attemptConversationPane } from "../panes";

export function AttemptSwitchButton() {
  const { conversation } = conversationPane.useData();
  const { data } = useResource(attemptsResource);
  const match = usePaneMatch();

  const attempt = data?.find((a) => a.id === conversation.attemptId) ?? null;
  const count = attempt?.conversations.length ?? 0;

  const inAttemptView =
    match?.chain.some((e) => e.pane === attemptPane._internal) ?? false;

  return (
    <Button
      variant={inAttemptView ? "secondary" : "ghost"}
      size="sm"
      title={inAttemptView ? "Close attempt view" : "Open attempt view"}
      aria-label={inAttemptView ? "Close attempt view" : "Open attempt view"}
      aria-pressed={inAttemptView}
      onClick={() => {
        if (inAttemptView) {
          conversationPane.open({ convId: conversation.id });
        } else {
          attemptConversationPane.open({
            attemptId: conversation.attemptId,
            convId: conversation.id,
          });
        }
      }}
      className="gap-1.5"
    >
      <MdSplitscreen className="size-4" />
      <span className="text-xs tabular-nums">{count}</span>
    </Button>
  );
}
