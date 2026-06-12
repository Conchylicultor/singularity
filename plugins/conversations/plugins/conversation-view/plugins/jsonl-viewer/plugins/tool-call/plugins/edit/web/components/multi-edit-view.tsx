import type { ToolRendererProps, ToolCallEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { InlineDiff } from "./inline-diff";

type MultiEditInput = {
  file_path: string;
  edits: { old_string: string; new_string: string }[];
};

function ResultDetail({ result }: { result: ToolCallEvent["result"] }) {
  if (!result || !result.isError) return null;
  return (
    <Text
      as="div"
      variant="caption"
      tone="destructive"
      // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the error detail from the diffs above; element mixes bg+rounded+padding so it's not a clean Stack/Inset
      className="mt-2 rounded-md bg-destructive/10 p-sm whitespace-pre-wrap break-words"
    >
      {result.content || "Error"}
    </Text>
  );
}

export function MultiEditView({ event }: ToolRendererProps) {
  const { file_path = "", edits = [] } = (event.input ?? {}) as Partial<MultiEditInput>;
  const multi = edits.length > 1;
  return (
    <ToolCallCard event={event} aside={<FilePath filePath={file_path} />} defaultOpen>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the body from the ToolCallCard header inside its collapsible region; not a Stack-owned gap */}
      <Stack gap="md" className="mt-2">
        {edits.map((edit, i) => (
          <div key={i}>
            {multi && (
              /* eslint-disable-next-line spacing/no-adhoc-spacing -- mb-1 offsets the per-edit label from its diff; not a flex-sibling gap */
              <div className="mb-1 flex items-center gap-sm text-2xs text-muted-foreground">
                <span>Edit {i + 1} / {edits.length}</span>
                <hr className="flex-1 border-border/40" />
              </div>
            )}
            <InlineDiff
              oldText={edit.old_string}
              newText={edit.new_string}
              path={file_path}
            />
          </div>
        ))}
        <ResultDetail result={event.result} />
      </Stack>
    </ToolCallCard>
  );
}
