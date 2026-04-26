import { GitFork } from "lucide-react";
import {
  type ConversationRecord,
  usePromptDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
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
  const { draft, clearDraft } = usePromptDraft(conversation.id);
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-1">
          <GitFork className="size-3.5 text-muted-foreground" />
          <LaunchButtons
            size="sm"
            getRequest={() => {
              const prompt = draft.trim();
              return {
                attemptId: conversation.attemptId,
                ...(prompt ? { prompt } : {}),
              };
            }}
            onLaunched={clearDraft}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          New conversation in this worktree
          {draft.trim() ? " — sends typed message" : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
