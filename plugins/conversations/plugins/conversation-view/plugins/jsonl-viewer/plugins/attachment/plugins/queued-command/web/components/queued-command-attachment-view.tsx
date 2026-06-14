import { MdSchedule } from "react-icons/md";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";

interface QueuedCommandPayload {
  type: "queued_command";
  prompt: string;
  commandMode: string;
}

// A prompt the user typed while the agent was busy, parked in the queue for
// delivery on the next turn. It is the human's voice (not a harness block), so
// it renders default-open with foreground text — the queued content is the whole
// point and hiding it behind a chevron would bury the user's intent. A calm
// "Queued" eyebrow + clock icon marks it as pending, never a sent turn.
export function QueuedCommandAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as QueuedCommandPayload;
  const isPrompt = att.commandMode === "prompt";

  return (
    <CollapsibleCard
      defaultOpen
      label={
        <span className="flex items-center gap-xs">
          <MdSchedule className="size-3.5" />
          {isPrompt ? "Queued message" : "Queued command"}
        </span>
      }
    >
      <Text
        as="div"
        variant="caption"
        className={cn(
          "whitespace-pre-wrap break-words text-foreground",
          !isPrompt && "font-mono",
        )}
      >
        {att.prompt}
      </Text>
    </CollapsibleCard>
  );
}
