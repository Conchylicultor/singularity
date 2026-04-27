import { GitBranchPlus } from "lucide-react";
import {
  type ConversationRecord,
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
            getRequest={() => {
              const prompt = draft.trim();
              return {
                forkFromConversationId: conversation.id,
                ...(prompt ? { prompt } : {}),
              };
            }}
            onLaunched={clearDraft}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          {!ready
            ? "Waiting for Claude session…"
            : `Fork conversation${draft.trim() ? " — sends typed message" : ""}`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
