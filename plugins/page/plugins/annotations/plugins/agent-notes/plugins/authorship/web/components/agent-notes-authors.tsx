import { ConversationRowById } from "@plugins/conversations/plugins/conversation-ui/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { AgentNotesAuthor } from "../../shared/schemas";

/**
 * The card's provenance, as the content of its glyph popover: who wrote in here,
 * oldest first, each opening the conversation that did.
 *
 * ## Not a DataView
 *
 * This is transient chrome — at most a handful of rows in a popover hung off a
 * `size-5` glyph, with no search / sort / filter / grouping to earn. It is the
 * same call `page/prompt/block`'s launched-conversation chips make.
 *
 * The row is `ConversationRowById`: the shared "a conversation, clickable,
 * opening its run" widget, in its by-id form, because a note's author record
 * carries only the id and deliberately outlives the conversation it names (see
 * the table's comment). The trailing time is this card's own fact — when that
 * conversation FIRST wrote here — not the conversation's age, which the inline
 * layout deliberately omits.
 */
export function AgentNotesAuthors({
  authors,
  onOpen,
}: {
  authors: readonly AgentNotesAuthor[];
  /** Called once a row navigates, so the shell can dismiss its popover. */
  onOpen: () => void;
}) {
  return (
    <Stack gap="2xs">
      <Text variant="eyebrow" tone="muted">
        Written by
      </Text>
      {authors.map((author) => (
        <ConversationRowById
          key={author.conversationId}
          convId={author.conversationId}
          layout="inline"
          onOpen={onOpen}
          trailing={
            <Text variant="caption" tone="muted">
              <RelativeTime date={author.createdAt} />
            </Text>
          }
        />
      ))}
    </Stack>
  );
}
