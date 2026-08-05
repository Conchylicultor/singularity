import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
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
 * same call `page/prompt/block`'s launched-conversation chips make. The rows go
 * through a named component rather than a bare `.map(… <Row>)`, which is also
 * what each row needs anyway: its own `useConversationById` subscription.
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
        <AuthorRow key={author.conversationId} author={author} onOpen={onOpen} />
      ))}
    </Stack>
  );
}

/**
 * One contributing conversation.
 *
 * `useConversationById` resolves the id live for a recent conversation and by a
 * one-shot fetch for an older one. It returns `null` both while that fetch is in
 * flight and when the conversation is genuinely gone (the record deliberately
 * outlives it — see the table's comment), and those two are indistinguishable
 * from here — so the row falls back to the raw id rather than claiming either.
 * It stays clickable in that state on purpose: the common `null` is "still
 * loading", and disabling on it would make a live link dead for its first frame.
 */
function AuthorRow({
  author,
  onOpen,
}: {
  author: AgentNotesAuthor;
  onOpen: () => void;
}) {
  const conv = useConversationById(author.conversationId);
  const openPane = useOpenPane();

  return (
    <Row
      size="sm"
      hover="muted"
      title={conv?.title ?? author.conversationId}
      onClick={() => {
        openPane(conversationPane, { convId: author.conversationId }, { mode: "push" });
        onOpen();
      }}
    >
      <Fill>
        {conv ? (
          <ConversationItem conv={conv} layout="inline" />
        ) : (
          <Text variant="caption" tone="muted">
            {author.conversationId}
          </Text>
        )}
      </Fill>
      {/* When this conversation FIRST wrote here — the fact the card is about.
          Not the conversation's own age, which `ConversationItem`'s block layout
          carries and its inline one deliberately omits. */}
      <Text variant="caption" tone="muted">
        <RelativeTime date={author.createdAt} />
      </Text>
    </Row>
  );
}
