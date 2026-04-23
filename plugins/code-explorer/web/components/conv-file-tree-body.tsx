import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { FileTreeView } from "./file-tree-view";

export function ConvFileTreeBody() {
  const { conversation } = conversationPane.useData();
  return (
    <div className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden">
      <FileTreeView worktree={conversation.attemptId} />
    </div>
  );
}
