import { GitFork } from "lucide-react";
import {
  type ConversationRecord,
  draftToPlainText,
  usePromptDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
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
  const plainPrompt = draftToPlainText(draft);
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-1">
          <GitFork className="size-3.5 text-muted-foreground" />
          <LaunchButtons
            size="sm"
            variant="outline"
            getRequest={() => ({
              attemptId: conversation.attemptId,
              ...(plainPrompt ? { prompt: plainPrompt } : {}),
            })}
            onLaunched={clearDraft}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          New conversation in this worktree
          {plainPrompt ? " — sends typed message" : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
