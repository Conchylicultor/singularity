import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useConversationPreprompt } from "../internal/hooks";
import { PrepromptIcon } from "./preprompt-icon";

// Sidebar row marker surfacing the preprompt a conversation was launched with,
// as a small muted glyph (mirrors the op-status chip's placement). Rendered for
// every conversation that has a preprompt — PrepromptIcon resolves the icon
// live and falls back to a default glyph, so the marker is always visible.
// Conversations launched without any preprompt stay unadorned.
export function PrepromptListIcon({ conv }: { conv: ConversationItemConv }) {
  const record = useConversationPreprompt(conv.id);
  if (!record) return null;
  return (
    <WithTooltip content={`Preprompt: ${record.title}`}>
      <Inline as="span" gap="none" className="text-muted-foreground">
        <PrepromptIcon record={record} />
      </Inline>
    </WithTooltip>
  );
}
