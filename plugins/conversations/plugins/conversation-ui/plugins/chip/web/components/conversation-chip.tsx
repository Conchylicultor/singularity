import {
  ConversationItem,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

export type ConversationChipProps = {
  /**
   * The conversation to name. Structural, like `ConversationItem`'s own prop —
   * a full `Conversation` row and the narrower `ConversationSummary` carried by
   * `attemptsResource` both fit.
   */
  conv: ConversationItemConv;
};

/**
 * A conversation, as a clickable chip that opens its run beside the surface
 * naming it.
 *
 * The sibling `item` plugin is pure presentation — it paints a conversation and
 * nothing else, on purpose, so that a row, a chip and a card can each wrap their
 * own chrome around one rendering. This is that wrapper for the chip case,
 * written once: a ghost `ToggleChip` around an inline `ConversationItem`, which
 * pushes a conversation column on click and lights up while that column is the
 * one open.
 *
 * A chip with no title yet reads "Starting…" — a conversation is created before
 * its title is generated, so the alternative is a chip that is momentarily blank.
 */
export function ConversationChip({ conv }: ConversationChipProps) {
  const openPane = useOpenPane();
  // The conversation column this chip's surface opened, if one is currently in
  // the route. Pages mounts Miller columns, so a conversation pane in the chain
  // is by definition one opened from a page — take the last (rightmost) one.
  const activeConvId = conversationPane.useRouteEntries().at(-1)?.params.convId;

  return (
    <ToggleChip
      variant="ghost"
      active={activeConvId === conv.id}
      title={conv.title ?? "Starting…"}
      onClick={() =>
        openPane(conversationPane, { convId: conv.id }, { mode: "push" })
      }
    >
      <ConversationItem conv={conv} layout="inline" />
    </ToggleChip>
  );
}
