import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { convFileTreePane } from "../panes";
import { FileTreeView } from "./file-tree-view";

export function ConvFileTreeBody() {
  const { convId: inputConvId } = convFileTreePane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  if (!conversation) return null;
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <FileTreeView worktree={conversation.attemptId} />
    </div>
  );
}
