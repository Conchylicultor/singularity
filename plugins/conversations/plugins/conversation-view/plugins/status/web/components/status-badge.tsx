import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import type { ConversationStatus } from "@plugins/conversations/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";

const STATUS_CLASSES: Record<ConversationStatus, string> = {
  starting: "bg-muted text-muted-foreground",
  working: "bg-muted text-muted-foreground",
  waiting: "bg-muted text-muted-foreground",
  gone: "bg-warning/15 text-warning",
  done: "bg-muted text-muted-foreground/60 italic",
};

const STATUS_LABELS: Partial<Record<ConversationStatus, string>> = {
  gone: "disconnected",
};

function prettify(status: ConversationStatus): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function StatusBadge() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <Badge colorClass={STATUS_CLASSES[conversation.status]}>
      {prettify(conversation.status)}
    </Badge>
  );
}
