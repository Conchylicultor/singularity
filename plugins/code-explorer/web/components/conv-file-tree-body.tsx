import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { FileTreeView } from "./file-tree-view";

export function ConvFileTreeBody() {
  const { conversation } = conversationPane.useData();
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <FileTreeView worktree={conversation.attemptId} />
    </div>
  );
}
