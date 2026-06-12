import type { ToolRendererProps, ToolCallEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { InlineDiff } from "./inline-diff";

type EditInput = { file_path: string; old_string: string; new_string: string };

function ResultDetail({ result }: { result: ToolCallEvent["result"] }) {
  if (!result || !result.isError) return null;
  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the error detail from the diff above; element mixes bg+rounded+padding so it's not a clean Stack/Inset
    <Text as="div" variant="caption" className="mt-2 rounded-md bg-destructive/10 p-sm text-destructive whitespace-pre-wrap break-words">
      {result.content || "Error"}
    </Text>
  );
}

export function EditView({ event }: ToolRendererProps) {
  const { file_path = "", old_string = "", new_string = "" } = (event.input ?? {}) as Partial<EditInput>;
  return (
    <ToolCallCard event={event} aside={<FilePath filePath={file_path} />} defaultOpen>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the body from the ToolCallCard header inside its collapsible region; not a Stack-owned gap */}
      <Stack gap="sm" className="mt-2">
        <InlineDiff oldText={old_string} newText={new_string} path={file_path} />
        <ResultDetail result={event.result} />
      </Stack>
    </ToolCallCard>
  );
}
