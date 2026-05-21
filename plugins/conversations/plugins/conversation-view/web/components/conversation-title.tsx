import { useConversationById } from "@plugins/conversations/web";
import { conversationPane } from "../panes";

export function ConversationTitle() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <span className="truncate text-sm font-medium">
      {conversation.title ?? conversation.id}
    </span>
  );
}
