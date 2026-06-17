import { useConversationById } from "@plugins/conversations/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { conversationPane } from "../panes";

export function ConversationTitle() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <Text variant="label" className="truncate">
      {conversation.title ?? conversation.id}
    </Text>
  );
}
