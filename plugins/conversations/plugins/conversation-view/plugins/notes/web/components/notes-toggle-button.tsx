import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
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
  const { isVisible, noteExists, read, toggleVisible } = useConversationNote(
    conversation.id,
  );

  // Nothing to offer until the note is known: "Add note" over a note that
  // exists would be a lie. A failed read keeps the button's face and says so —
  // it is the one place the failure is reported (the area stays hidden).
  if (read.status === "loading") return null;
  if (read.status === "error")
    return (
      <ResourceErrorInline
        variant="icon"
        icon={MdStickyNote2}
        subject="the note"
        error={read.error}
        refetch={read.refetch}
      />
    );
  if (noteExists) return null;

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
