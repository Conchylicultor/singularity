import { MdPrecisionManufacturing } from "react-icons/md";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { cn } from "@/lib/utils";
import { agentLaunchesResource } from "../../shared/resources";
import { agentSidePane } from "../panes";

export function AgentChipToolbar() {
  const { conversation } = conversationPane.useData();
  if (conversation.kind !== "agent") return null;

  const match = usePaneMatch();
  const isOpen = match?.chain.some((e) => e.pane === agentSidePane._internal) ?? false;
  const { data: launches } = useResource(agentLaunchesResource);
  const agentId = (launches ?? []).find((l) => l.taskId === conversation.taskId)?.agentId;

  return (
    <button
      disabled={!agentId}
      aria-pressed={isOpen}
      onClick={() =>
        isOpen
          ? agentSidePane.close()
          : agentSidePane.open({ convId: conversation.id, agentId: agentId! })
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-violet-600 transition-colors dark:text-violet-400",
        isOpen ? "bg-violet-500/30" : "bg-violet-500/15 hover:bg-violet-500/25",
        !agentId && "pointer-events-none cursor-default",
      )}
    >
      <MdPrecisionManufacturing className="size-3" />
      Agent
    </button>
  );
}
