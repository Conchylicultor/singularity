import type { ToolCallEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * A refused page write, verbatim. The server's refusals are written to be read
 * (a 403 names the block that was edited outside every card), so the sentence is
 * the whole affordance.
 *
 * Same appearance as the Edit tool's error detail, composed from the spacing
 * primitives rather than copying its hand-written padding and top margin: every
 * caller already sits in a `Stack gap="sm"`, which owns the offset.
 */
export function PageToolError({ result }: { result: ToolCallEvent["result"] }) {
  if (!result || !result.isError) return null;
  return (
    <Inset pad="sm" className="rounded-md bg-destructive/10">
      <Text
        as="div"
        variant="caption"
        className="text-destructive whitespace-pre-wrap break-words"
      >
        {result.content || "Error"}
      </Text>
    </Inset>
  );
}
