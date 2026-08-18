import { MdFlag } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

type FlagRaiseInput = {
  reason: string;
};

export function FlagRaiseToolView({ event }: ToolRendererProps) {
  const input = event.input as FlagRaiseInput;

  return (
    <ToolCallCard event={event} summary="Flagged for review" defaultOpen>
      <Stack
        direction="row"
        gap="sm"
        align="start"
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the banner from the card header
        className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-md py-sm"
      >
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 optically centers the icon to the first text line */}
        <MdFlag className={cn("mt-0.5 size-4 text-warning", rigidClass())} />
        <Text as="p" variant="caption" className="whitespace-pre-wrap">
          {input.reason}
        </Text>
      </Stack>
      {event.result?.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 separates the error text from the banner above
        <Text as="p" variant="caption" className="mt-2 text-destructive">
          {event.result.content}
        </Text>
      )}
    </ToolCallCard>
  );
}
