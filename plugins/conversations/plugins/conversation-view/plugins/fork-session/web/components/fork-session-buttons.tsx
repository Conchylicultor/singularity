import { GitBranchPlus } from "lucide-react";
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

export function ForkSessionButtons({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { draft, clearDraft } = usePromptDraft(conversation.id);
  const plainPrompt = draftToPlainText(draft);
  const ready = !!conversation.claudeSessionId;
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-1">
          <GitBranchPlus className="size-3.5 text-muted-foreground" />
          <LaunchButtons
            size="sm"
            variant="outline"
            disabled={!ready}
            getRequest={() => ({
              forkFromConversationId: conversation.id,
              ...(plainPrompt ? { prompt: plainPrompt } : {}),
            })}
            onLaunched={clearDraft}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          {!ready
            ? "Waiting for Claude session…"
            : `Fork conversation${plainPrompt ? " — sends typed message" : ""}`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
