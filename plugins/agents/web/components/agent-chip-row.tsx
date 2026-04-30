import { MdPrecisionManufacturing } from "react-icons/md";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";

export function AgentChipRow({ conv }: { conv: ConversationItemConv }) {
  if (conv.kind !== "agent") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-violet-500/15 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
      <MdPrecisionManufacturing className="size-2.5" />
      Agent
    </span>
  );
}
