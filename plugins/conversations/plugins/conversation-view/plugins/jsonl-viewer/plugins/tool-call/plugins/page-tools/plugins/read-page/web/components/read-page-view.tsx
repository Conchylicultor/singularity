import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import {
  PageMarkdown,
  PageRefChip,
  PageToolError,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/page-tools/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

// `block_id` was `blockId` in an earlier revision of this tool; old transcripts carry that spelling.
type ReadPageInput = { block_id: string; blockId: string };

export function ReadPageView({ event }: ToolRendererProps) {
  const input = (event.input ?? {}) as Partial<ReadPageInput>;
  const blockId = input.block_id ?? input.blockId ?? "";

  return (
    <ToolCallCard event={event} aside={<PageRefChip blockId={blockId} />}>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the body from the ToolCallCard header inside its collapsible region; not a Stack-owned gap */}
      <Stack gap="sm" className="mt-2">
        {event.result && !event.result.isError && (
          <PageMarkdown text={event.result.content} />
        )}
        <PageToolError result={event.result} />
      </Stack>
    </ToolCallCard>
  );
}
