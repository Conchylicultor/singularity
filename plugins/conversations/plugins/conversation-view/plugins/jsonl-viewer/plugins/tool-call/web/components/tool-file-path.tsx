import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

export function toRelativePath(filePath: string, attemptId: string): string {
  const marker = `/${attemptId}/`;
  const idx = filePath.indexOf(marker);
  return idx >= 0 ? filePath.slice(idx + marker.length) : filePath;
}

interface ToolFilePathProps {
  filePath: string;
}

export function ToolFilePath({ filePath }: ToolFilePathProps) {
  const { conversation } = conversationPane.useData();
  const openPane = useOpenPane();
  const relativePath = toRelativePath(filePath, conversation.attemptId);

  if (!filePath) return null;

  const openFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPane(filePeekPane, {
      worktree: conversation.attemptId,
      filePath,
    }, { mode: "push" });
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
