import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Avatar,
  DEFAULT_AGENT_AVATAR,
} from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { agentLaunchesResource, agentsResource } from "../../internal/resources";

// Resolves the launching agent for a conversation by walking
// agent_launches.task_id → conversation.taskId, then renders that agent's
// avatar with the conversation's status overlaid as a presence dot.
export function AgentAvatarRow({ conv }: { conv: ConversationItemConv }) {
  const { data: launches } = useResource(agentLaunchesResource);
  const { data: agents } = useResource(agentsResource);
  if (conv.kind !== "agent" || !conv.taskId) return null;
  const launch = launches.find((l) => l.taskId === conv.taskId);
  const agent = launch ? agents.find((a) => a.id === launch.agentId) : null;
  return (
    <Avatar
      icon={agent?.icon ?? DEFAULT_AGENT_AVATAR.icon}
      color={agent?.iconColor ?? DEFAULT_AGENT_AVATAR.color}
      size="sm"
      statusDot={CONV_STATUS_DOT[conv.status]}
      fallbackKey={agent?.id}
      title={agent?.name}
    />
  );
}
