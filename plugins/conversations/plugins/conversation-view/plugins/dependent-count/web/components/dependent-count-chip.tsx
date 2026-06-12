import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { DependentCountBadge } from "./dependent-count-badge";

export function DependentCountChip() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);

  if (!conversation) return null;

  return <DependentCountBadge taskId={conversation.taskId} />;
}
