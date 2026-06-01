import {
  HighlightedCode,
  languageForPath,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";

type WriteInput = { file_path: string; content: string };

export function WriteToolView({ event }: ToolRendererProps) {
  const { file_path = "", content = "" } = (event.input ?? {}) as Partial<WriteInput>;

  return (
    <ToolCallCard event={event} summary={<FilePath filePath={file_path} />}>
      <div className="mt-2">
        <HighlightedCode
          code={content}
          lang={languageForPath(file_path)}
          className="max-h-[280px] overflow-auto"
        />
        {event.result?.isError && (
          <p className="mt-1 text-xs text-destructive">{event.result.content}</p>
        )}
      </div>
    </ToolCallCard>
  );
}
