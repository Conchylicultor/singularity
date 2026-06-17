import {
  HighlightedCode,
  languageForPath,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type WriteInput = { file_path: string; content: string };

export function WriteToolView({ event }: ToolRendererProps) {
  const { file_path = "", content = "" } = (event.input ?? {}) as Partial<WriteInput>;

  return (
    <ToolCallCard event={event} aside={<FilePath filePath={file_path} />}>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the code block from the card header */}
      <div className="mt-2">
        <HighlightedCode
          code={content}
          lang={languageForPath(file_path)}
          className="max-h-[280px] overflow-auto"
        />
        {event.result?.isError && (
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-1 separates the error text from the code block above
          <Text as="p" variant="caption" className="mt-1 text-destructive">
            {event.result.content}
          </Text>
        )}
      </div>
    </ToolCallCard>
  );
}
