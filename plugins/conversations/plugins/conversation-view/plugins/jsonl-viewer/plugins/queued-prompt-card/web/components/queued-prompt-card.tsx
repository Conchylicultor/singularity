import { MdSchedule } from "react-icons/md";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";

/**
 * The one canonical appearance for a queued prompt — a message the user typed
 * while the agent was busy, parked for delivery on the next turn. The same card
 * renders whether the prompt arrives as a `queued_command` attachment or as a
 * prompt-queue `enqueue` lifecycle event, so the two never diverge visually.
 *
 * `defaultOpen` is the call-site's call: the attachment (the user's standing
 * intent) opens; the enqueue lifecycle marker stays closed so the timeline
 * reads calm.
 */
export function QueuedPromptCard({
  prompt,
  commandMode,
  defaultOpen,
}: {
  prompt: string;
  /** Claude Code queue command mode; absent for plain lifecycle enqueues. */
  commandMode?: string;
  defaultOpen?: boolean;
}) {
  const isPrompt = commandMode === undefined || commandMode === "prompt";

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
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
        {prompt}
      </Text>
    </CollapsibleCard>
  );
}
