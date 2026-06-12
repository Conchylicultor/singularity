import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { DependentCountBadge } from "./dependent-count-badge";

/** Per-row "N blocked" chip for the conversation item slot (queue/sidebar rows). */
export function DependentCountItemChip({ conv }: { conv: ConversationItemConv }) {
  return <DependentCountBadge taskId={conv.taskId} />;
}
