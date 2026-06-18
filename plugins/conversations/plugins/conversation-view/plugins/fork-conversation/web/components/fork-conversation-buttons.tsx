import { MdForkRight } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export function ForkConversationButtons({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  return (
    <WithTooltip content="New conversation in this worktree">
      <Stack direction="row" gap="xs" align="center">
        <MdForkRight className="size-3.5 text-muted-foreground" />
        <LaunchControl
          size="sm"
          variant="ghost"
          getRequest={() => ({ attemptId: conversation.attemptId })}
        />
      </Stack>
    </WithTooltip>
  );
}
