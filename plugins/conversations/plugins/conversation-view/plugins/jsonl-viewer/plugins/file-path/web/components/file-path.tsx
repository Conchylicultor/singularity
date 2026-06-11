import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";

export function toRelativePath(filePath: string, attemptId: string): string {
  // The attempt id can sit at a path boundary (`/att-xxx/…`) or as the suffix
  // of an encoded worktree-dir segment (`…-worktrees-att-xxx/…`), so anchor on
  // `<attemptId>/` rather than requiring a leading slash.
  const marker = `${attemptId}/`;
  const idx = filePath.indexOf(marker);
  return idx >= 0 ? filePath.slice(idx + marker.length) : filePath;
}

interface FilePathProps {
  filePath: string;
}

export function FilePath({ filePath }: FilePathProps) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const openPane = useOpenPane();

  if (!conversation) return null;
  if (!filePath) return null;

  const relativePath = toRelativePath(filePath, conversation.attemptId);

  const openFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPane(filePeekPane, {
      worktree: conversation.attemptId,
      filePath,
    }, { mode: "push" });
  };

  return (
    <span className="group/path inline-flex items-center gap-0.5 max-w-full min-w-0">
      <button
        onClick={openFile}
        className="min-w-0 max-w-full overflow-hidden whitespace-nowrap font-mono text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        style={{ direction: "rtl", textOverflow: "ellipsis" }}
        title={relativePath}
      >
        <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
          {relativePath}
        </span>
      </button>
      <CopyButton
        text={relativePath}
        title="Copy path"
        size="inline"
        className="opacity-0 group-hover/path:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      />
    </span>
  );
}
