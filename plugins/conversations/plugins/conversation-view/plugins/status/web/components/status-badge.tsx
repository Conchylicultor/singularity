import { useEffect, useState } from "react";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import type {
  Conversation,
  ConversationStatus,
} from "@plugins/conversations/shared/types";

const STATUS_CLASSES: Record<ConversationStatus, string> = {
  starting: "bg-muted text-muted-foreground",
  working: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  needs_attention: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  obsolete: "bg-muted text-muted-foreground/60 line-through",
};

function prettify(status: ConversationStatus): string {
  return status.replace(/_/g, " ");
}

export function StatusBadge({
  conversation,
}: {
  conversation: ConversationState;
}) {
  const [status, setStatus] = useState<ConversationStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/conversations/${conversation.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as Conversation;
      if (!cancelled) setStatus(data.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  if (!status) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {prettify(status)}
    </span>
  );
}
