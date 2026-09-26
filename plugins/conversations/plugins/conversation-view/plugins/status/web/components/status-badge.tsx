import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { HeaderChip } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";

// Each status is a bordered pill; the live one (working) takes the accent for
// its text and outline, so the one conversation doing something reads at a glance.
const STATUS_CLASSES: Record<ConversationStatus, string> = {
  starting: "bg-muted text-muted-foreground border-border",
  working: "bg-muted text-primary border-primary/40",
  waiting: "bg-muted text-muted-foreground border-border",
  gone: "bg-warning/15 text-warning border-warning/30",
  done: "bg-muted text-muted-foreground/60 italic border-border",
};

// Semantic overrides where the display word differs from the status key
// (not just casing). Everything else is sentence-cased via formatStatusLabel.
const STATUS_LABELS: Partial<Record<ConversationStatus, string>> = {
  gone: "Disconnected",
};

function prettify(status: ConversationStatus): string {
  return STATUS_LABELS[status] ?? formatStatusLabel(status);
}

export function StatusBadge() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <HeaderChip colorClass={STATUS_CLASSES[conversation.status]}>
      {prettify(conversation.status)}
    </HeaderChip>
  );
}
