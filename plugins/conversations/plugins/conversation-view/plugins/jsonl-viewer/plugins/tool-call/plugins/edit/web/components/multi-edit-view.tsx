import type { ToolRendererProps, ToolCallEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard, ToolFilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { InlineDiff } from "./inline-diff";

type MultiEditInput = {
  file_path: string;
  edits: { old_string: string; new_string: string }[];
};

function ResultDetail({ result }: { result: ToolCallEvent["result"] }) {
  if (!result || !result.isError) return null;
  return (
    <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap break-words">
      {result.content || "Error"}
    </div>
  );
}

export function MultiEditView({ event }: ToolRendererProps) {
  const { file_path = "", edits = [] } = (event.input ?? {}) as Partial<MultiEditInput>;
  const multi = edits.length > 1;
  return (
    <ToolCallCard event={event} summary={<ToolFilePath filePath={file_path} />} defaultOpen>
      <div className="mt-2 space-y-3">
        {edits.map((edit, i) => (
          <div key={i}>
            {multi && (
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
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
      </div>
    </ToolCallCard>
  );
}
