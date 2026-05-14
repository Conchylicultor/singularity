import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Avatar, DEFAULT_AGENT_AVATAR, type SvgNode } from "@plugins/primitives/plugins/avatar/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { agentLaunchesResource, agentsResource } from "../../shared/resources";
import { agentSidePane } from "../panes";
import { cn } from "@/lib/utils";

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch { return null; }
}

export function AgentAvatarTitlePrefix({ conversation }: { conversation: ConversationRecord }) {
  const { data: launches } = useResource(agentLaunchesResource);
  const { data: agents } = useResource(agentsResource);

  const launch = launches.find((l) => l.taskId === conversation.taskId);
  const agent = launch ? agents.find((a) => a.id === launch.agentId) : null;
  const agentId = launch?.agentId;

  const { isOpen, toggle } = agentSidePane.useToggle({
    agentId: agentId ?? "",
  });

  if (conversation.kind !== "agent") return null;

  return (
    <button
      type="button"
      disabled={!agentId}
      aria-pressed={isOpen}
      title={agent?.name ?? "Agent"}
      onClick={toggle}
      className={cn(
        "rounded-full transition-opacity",
        isOpen ? "opacity-100 ring-2 ring-ring ring-offset-1 ring-offset-background" : "hover:opacity-80",
        !agentId && "pointer-events-none cursor-default opacity-60",
      )}
    >
      <Avatar
        icon={agent?.icon ?? DEFAULT_AGENT_AVATAR.icon}
        color={agent?.iconColor ?? DEFAULT_AGENT_AVATAR.color}
        svgNodes={parseSvgNodes(agent?.iconSvgNodes) ?? DEFAULT_AGENT_AVATAR.svgNodes}
        size="sm"
        fallbackKey={agent?.id}
      />
    </button>
  );
}
