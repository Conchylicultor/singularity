import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Avatar, DEFAULT_AGENT_AVATAR } from "@plugins/primitives/plugins/avatar/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { agentLaunchesResource, agentsResource } from "../../shared/resources";
import { agentSidePane } from "../panes";
import { cn } from "@/lib/utils";

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch (err) { if (!(err instanceof SyntaxError)) throw err; return null; }
}

export function AgentAvatarTitlePrefix() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const launchesResult = useResource(agentLaunchesResource);
  const agentsResult = useResource(agentsResource);

  const launches = launchesResult.pending ? [] : launchesResult.data;
  const agentsList = agentsResult.pending ? [] : agentsResult.data;
  const launch = launches.find((l) => l.taskId === conversation?.taskId);
  const agent = launch ? agentsList.find((a) => a.id === launch.agentId) : null;
  const agentId = launch?.agentId;

  const { isOpen, toggle } = agentSidePane.useToggle({
    agentId: agentId ?? "",
  });

  if (!conversation || conversation.kind !== "agent") return null;

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
