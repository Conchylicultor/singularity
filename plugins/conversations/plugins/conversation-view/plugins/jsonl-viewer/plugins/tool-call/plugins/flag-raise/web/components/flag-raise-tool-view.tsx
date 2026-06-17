import { MdFlag } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type FlagRaiseInput = {
  reason: string;
};

export function FlagRaiseToolView({ event }: ToolRendererProps) {
  const input = event.input as FlagRaiseInput;

  return (
    <ToolCallCard event={event} summary="Flagged for review" defaultOpen>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the banner from the card header */}
      <div className="mt-2 flex items-start gap-sm rounded-md border border-warning/30 bg-warning/10 px-md py-sm">
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 optically centers the icon to the first text line */}
        <MdFlag className="mt-0.5 size-4 shrink-0 text-warning" />
        <Text as="p" variant="caption" className="whitespace-pre-wrap">{input.reason}</Text>
      </div>
      {event.result?.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 separates the error text from the banner above
        <Text as="p" variant="caption" className="mt-2 text-destructive">{event.result.content}</Text>
      )}
    </ToolCallCard>
  );
}
