import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdStickyNote2 } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationNote } from "../internal/use-conversation-note";

export function NotesToggleButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { isVisible, noteExists, pending, toggleVisible } = useConversationNote(
    conversation.id,
  );

  if (pending || noteExists) return null;

  return (
    <Button
      variant={isVisible ? "secondary" : "ghost"}
      aspect="icon"
      title={isVisible ? "Hide notes" : "Add note"}
      aria-label={isVisible ? "Hide notes" : "Add note"}
      aria-pressed={isVisible}
      onClick={toggleVisible}
    >
      <MdStickyNote2 className="size-3.5" />
    </Button>
  );
}
