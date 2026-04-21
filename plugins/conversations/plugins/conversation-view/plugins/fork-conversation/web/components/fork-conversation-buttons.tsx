import { GitFork } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { LaunchButtons } from "@plugins/launch/web";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ForkConversationButtons({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-1">
          <GitFork className="size-3.5 text-muted-foreground" />
          <LaunchButtons getRequest={() => ({ attemptId: conversation.attemptId })} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>New conversation in this worktree</p>
      </TooltipContent>
    </Tooltip>
  );
}
