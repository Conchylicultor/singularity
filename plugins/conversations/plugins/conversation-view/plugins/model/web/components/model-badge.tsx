import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import type { ConversationModel } from "@plugins/conversations/shared/types";

const MODEL_CLASSES: Record<ConversationModel, string> = {
  opus: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  sonnet: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export function ModelBadge({
  conversation,
}: {
  conversation: ConversationState;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODEL_CLASSES[conversation.model]}`}
    >
      {conversation.model}
    </span>
  );
}
