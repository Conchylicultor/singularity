import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdStickyNote2 } from "react-icons/md";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
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
    <IconButton
      icon={MdStickyNote2}
      label={isVisible ? "Hide notes" : "Add note"}
      variant={isVisible ? "secondary" : "ghost"}
      aria-pressed={isVisible}
      onClick={toggleVisible}
    />
  );
}
