import { MdFlag } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Text } from "@plugins/primitives/plugins/text/web";

type FlagRaiseInput = {
  reason: string;
};

export function FlagRaiseToolView({ event }: ToolRendererProps) {
  const input = event.input as FlagRaiseInput;

  return (
    <ToolCallCard event={event} summary="Flagged for review" defaultOpen>
      <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
        <MdFlag className="mt-0.5 size-4 shrink-0 text-warning" />
        <Text as="p" variant="caption" className="whitespace-pre-wrap">{input.reason}</Text>
      </div>
      {event.result?.isError && (
        <Text as="p" variant="caption" className="mt-2 text-destructive">{event.result.content}</Text>
      )}
    </ToolCallCard>
  );
}
