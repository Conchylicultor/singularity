import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { CodeWithLineNumbers } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/code-listing/web";
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
    <Badge variant="muted" size="sm" className="shrink-0 font-mono">
      {label}
    </Badge>
  );
}

export function ReadToolView({ event }: ToolRendererProps) {
  const { file_path = "", offset, limit } = (event.input ?? {}) as Partial<ReadInput>;
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);

  if (!conversation) return null;

  const aside = (
    <span className="flex min-w-0 items-center gap-2">
      <FilePath filePath={file_path} />
      <LineRangeBadge offset={offset} limit={limit} />
    </span>
  );

  const isImage = isImagePath(file_path);

  return (
    <ToolCallCard event={event} aside={aside} defaultOpen={isImage}>
      {event.result && (
        <div className="mt-2">
          {event.result.isError ? (
            <Text as="p" variant="caption" className="text-destructive">{event.result.content}</Text>
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
