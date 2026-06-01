import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";

const FAMILY_CLASSES: Record<"opus" | "sonnet", string> = {
  opus: "bg-muted text-muted-foreground",
  sonnet: "bg-muted text-muted-foreground",
};

export function ModelBadge() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  const model = normalizeModel(conversation.model);
  const meta = MODEL_REGISTRY[model];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FAMILY_CLASSES[meta.family]}`}
    >
      {meta.label}
    </span>
  );
}
