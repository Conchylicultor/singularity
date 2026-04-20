import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web";
import type { ConversationStatus } from "@plugins/conversations/shared";

const STATUS_CLASSES: Record<ConversationStatus, string> = {
  starting: "bg-muted text-muted-foreground",
  working: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  gone: "bg-muted text-muted-foreground/60 italic",
};

function prettify(status: ConversationStatus): string {
  return status.replace(/_/g, " ");
}

export function StatusBadge({
  conversation,
}: {
  conversation: ConversationState;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[conversation.status]}`}
    >
      {prettify(conversation.status)}
    </span>
  );
}
