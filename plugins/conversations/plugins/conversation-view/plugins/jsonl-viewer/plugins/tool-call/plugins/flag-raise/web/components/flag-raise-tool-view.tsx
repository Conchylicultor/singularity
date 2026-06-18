import { MdFlag } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

type FlagRaiseInput = {
  reason: string;
};

export function FlagRaiseToolView({ event }: ToolRendererProps) {
  const input = event.input as FlagRaiseInput;

  return (
    <ToolCallCard event={event} summary="Flagged for review" defaultOpen>
      <Frame
        gap="sm"
        align="start"
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the banner from the card header
        className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-md py-sm"
        leading={
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 optically centers the icon to the first text line
          <MdFlag className="mt-0.5 size-4 text-warning" />
        }
        content={
          <Text as="p" variant="caption" className="whitespace-pre-wrap">
            {input.reason}
          </Text>
        }
      />
      {event.result?.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 separates the error text from the banner above
        <Text as="p" variant="caption" className="mt-2 text-destructive">{event.result.content}</Text>
      )}
    </ToolCallCard>
  );
}
