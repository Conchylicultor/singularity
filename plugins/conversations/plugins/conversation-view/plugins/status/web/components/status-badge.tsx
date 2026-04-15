import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import type { ConversationStatus } from "@plugins/conversations/shared/types";

const STATUS_CLASSES: Record<ConversationStatus, string> = {
  starting: "bg-muted text-muted-foreground",
  working: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  needs_attention: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  gone: "bg-muted text-muted-foreground/60 italic",
  abandoned: "bg-muted text-muted-foreground/60 line-through",
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
