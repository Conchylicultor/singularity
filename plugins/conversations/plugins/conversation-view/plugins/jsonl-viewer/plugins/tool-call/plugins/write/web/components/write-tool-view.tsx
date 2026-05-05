import {
  HighlightedCode,
  languageForPath,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFilePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/shared";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type WriteInput = { file_path: string; content: string };

function toRelativePath(filePath: string, attemptId: string): string {
  const marker = `/${attemptId}/`;
  const idx = filePath.indexOf(marker);
  return idx >= 0 ? filePath.slice(idx + marker.length) : filePath;
}

function WriteSummaryHint({ event }: ToolRendererProps) {
  const { conversation } = conversationPane.useData();
  const { file_path } = event.input as WriteInput;
  const relativePath = toRelativePath(file_path, conversation.attemptId);

  const openFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    convFilePeekPane.open({
      convId: conversation.id,
      worktree: conversation.attemptId,
      filePath: file_path,
    });
  };

  return (
    <button
      onClick={openFile}
      className="w-max max-w-full overflow-hidden whitespace-nowrap font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      style={{ direction: "rtl", textOverflow: "ellipsis" }}
      title={relativePath}
    >
      <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
        {relativePath}
      </span>
    </button>
  );
}

export function WriteToolView({ event }: ToolRendererProps) {
  const { file_path, content } = event.input as WriteInput;

  return (
    <ToolCallCard event={event} summary={<WriteSummaryHint event={event} />}>
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
