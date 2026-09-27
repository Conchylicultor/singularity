import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { useConversationNote } from "../internal/use-conversation-note";
import { symbol } from "@plugins/ui/plugins/icons/core";

const stickyNote2Icon = symbol("sticky-note-2");

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
    <IconButton
      icon={stickyNote2Icon}
      label={isVisible ? "Hide notes" : "Add note"}
      variant={isVisible ? "secondary" : "ghost"}
      aria-pressed={isVisible}
      onClick={toggleVisible}
    />
  );
}
