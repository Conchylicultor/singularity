import { MdPrecisionManufacturing } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";

export function AgentChipToolbar() {
  const { conversation } = conversationPane.useData();
  if (conversation.kind !== "agent") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
      <MdPrecisionManufacturing className="size-3" />
      Agent
    </span>
  );
}
