import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationNote } from "../internal/use-conversation-note";

export function NotesToggleButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { isVisible, noteExists, toggleVisible } = useConversationNote(
    conversation.id,
  );

  if (noteExists) return null;

  return (
    <Button
      variant={isVisible ? "secondary" : "ghost"}
      size="icon-sm"
      title={isVisible ? "Hide notes" : "Add note"}
      aria-label={isVisible ? "Hide notes" : "Add note"}
      aria-pressed={isVisible}
      onClick={toggleVisible}
    >
      <StickyNote className="size-3.5" />
    </Button>
  );
}
