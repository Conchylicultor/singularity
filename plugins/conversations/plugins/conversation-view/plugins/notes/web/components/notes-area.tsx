import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationNote } from "../internal/use-conversation-note";

export function NotesArea({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { value, onChange, onFocus, onBlur, isVisible, isSaving } =
    useConversationNote(conversation.id);

  if (!isVisible) return null;

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Notes…"
        rows={2}
        className="w-full resize-y rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed placeholder:text-amber-400/70 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-600/40 dark:bg-amber-950/30 dark:placeholder:text-amber-600/60 dark:focus:ring-amber-600"
        aria-label="Conversation notes"
      />
      {isSaving && (
        <span className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-muted-foreground select-none">
          Saving…
        </span>
      )}
    </div>
  );
}
