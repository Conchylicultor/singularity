import { conversationPane } from "../panes";

export function ConversationTitle() {
  const { conversation } = conversationPane.useData();
  return (
    <span className="truncate text-sm font-medium">
      {conversation.title ?? conversation.id}
    </span>
  );
}
