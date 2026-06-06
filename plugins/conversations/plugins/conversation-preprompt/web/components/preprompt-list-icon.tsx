import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useConversationPreprompt } from "../internal/hooks";
import { PrepromptIcon } from "./preprompt-icon";

// Sidebar row marker surfacing the preprompt a conversation was launched with,
// as a small colored icon disc (mirrors the op-status chip's placement). Only
// rendered when the snapshot carries a chosen icon, so conversations launched
// without a preprompt — or with an icon-less one — stay unadorned.
export function PrepromptListIcon({ conv }: { conv: ConversationItemConv }) {
  const record = useConversationPreprompt(conv.id);
  if (!record?.icon?.svgNodes?.length) return null;
  return (
    <WithTooltip content={`Preprompt: ${record.title}`}>
      <span className="inline-flex text-muted-foreground">
        <PrepromptIcon record={record} />
      </span>
    </WithTooltip>
  );
}
