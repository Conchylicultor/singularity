import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";

export function ModelBadge() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  const model = normalizeModel(conversation.model);
  const meta = MODEL_REGISTRY[model];
  return (
    <Badge colorClass={familyClass(meta.family)}>
      {meta.label}
    </Badge>
  );
}
