import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { useConversationNote } from "../internal/use-conversation-note";

export function NotesArea({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { value, onChange, onFocus, onBlur, isVisible, isSaving, pending } =
    useConversationNote(conversation.id);

  if (pending || !isVisible) return null;

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Notes…"
        rows={2}
        className="w-full resize-y rounded-md border border-warning/60 bg-warning/10 px-md py-sm text-caption placeholder:text-warning/70 focus:outline-none focus:ring-1 focus:ring-warning"
        aria-label="Conversation notes"
      />
      {isSaving && (
        <Pin
          as="span"
          to="bottom-right"
          decorative
          // off-ramp insets: right-2 / bottom-1.5 aren't a single ramp step
          style={{ right: "0.5rem", bottom: "0.375rem" }}
          className="text-3xs text-muted-foreground select-none"
        >
          Saving…
        </Pin>
      )}
    </div>
  );
}
