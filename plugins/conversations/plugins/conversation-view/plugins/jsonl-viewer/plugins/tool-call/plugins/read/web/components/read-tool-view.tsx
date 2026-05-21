import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import {
  ToolCallCard,
  ToolFilePath,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { CodeWithLineNumbers } from "./code-with-line-numbers";
import { ReadImageView } from "./read-image-view";

type ReadInput = { file_path: string; offset?: number; limit?: number };

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "avif",
]);

function isImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(filePath.slice(dot + 1).toLowerCase());
}

function LineRangeBadge({
  offset,
  limit,
}: {
  offset?: number;
  limit?: number;
}) {
  if (offset == null && limit == null) return null;
  const start = (offset ?? 0) + 1;
  const end = limit != null ? start + limit - 1 : null;
  const label = end != null ? `L${start}–${end}` : `L${start}+`;
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

export function ReadToolView({ event }: ToolRendererProps) {
  const { file_path, offset, limit } = event.input as ReadInput;
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);

  if (!conversation) return null;

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <ToolFilePath filePath={file_path} />
      <LineRangeBadge offset={offset} limit={limit} />
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {event.result && (
        <div className="mt-2">
          {event.result.isError ? (
            <p className="text-xs text-destructive">{event.result.content}</p>
          ) : isImagePath(file_path) ? (
            <ReadImageView
              worktree={conversation.attemptId}
              filePath={file_path}
            />
          ) : (
            <CodeWithLineNumbers
              content={event.result.content}
              filePath={file_path}
            />
          )}
        </div>
      )}
    </ToolCallCard>
  );
}
