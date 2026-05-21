import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

const MODEL_CLASSES: Record<ConversationModel, string> = {
  opus: "bg-muted text-muted-foreground",
  sonnet: "bg-muted text-muted-foreground",
};

export function ModelBadge() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODEL_CLASSES[conversation.model]}`}
    >
      {conversation.model}
    </span>
  );
}
