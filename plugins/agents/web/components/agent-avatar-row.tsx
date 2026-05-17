import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Avatar,
  DEFAULT_AGENT_AVATAR,
  type SvgNode,
} from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { agentLaunchesResource, agentsResource } from "../../shared/resources";

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch { return null; }
}

export function AgentAvatarRow({ conv }: { conv: ConversationItemConv }) {
  const launchesResult = useResource(agentLaunchesResource);
  const agentsResult = useResource(agentsResource);
  if (conv.kind !== "agent" || !conv.taskId) return null;
  if (launchesResult.pending || agentsResult.pending) return null;
  const launches = launchesResult.data;
  const agents = agentsResult.data;
  const launch = launches.find((l) => l.taskId === conv.taskId);
  const agent = launch ? agents.find((a) => a.id === launch.agentId) : null;
  return (
    <Avatar
      icon={agent?.icon ?? DEFAULT_AGENT_AVATAR.icon}
      color={agent?.iconColor ?? DEFAULT_AGENT_AVATAR.color}
      svgNodes={parseSvgNodes(agent?.iconSvgNodes) ?? DEFAULT_AGENT_AVATAR.svgNodes}
      size="sm"
      statusDot={CONV_STATUS_DOT[conv.status]}
      fallbackKey={agent?.id}
      title={agent?.name}
    />
  );
}
