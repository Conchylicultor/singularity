import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Avatar, DEFAULT_AGENT_AVATAR } from "@plugins/primitives/plugins/avatar/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { agentLaunchesResource, agentsResource } from "../../shared/resources";
import { agentSidePane } from "../panes";
import { cn } from "@/lib/utils";

// Renders before the conversation pane title for agent-launched conversations.
// Replaces the legacy violet "Agent" pill — the avatar already conveys both
// "this is from an agent" and "which agent". Click toggles the side pane that
// shows the agent's detail/history.
export function AgentAvatarTitlePrefix({ conversation }: { conversation: ConversationRecord }) {
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const { data: launches } = useResource(agentLaunchesResource);
  const { data: agents } = useResource(agentsResource);

  if (conversation.kind !== "agent") return null;

  const isOpen = match?.chain.some((e) => e.pane === agentSidePane._internal) ?? false;
  const launch = launches.find((l) => l.taskId === conversation.taskId);
  const agent = launch ? agents.find((a) => a.id === launch.agentId) : null;
  const agentId = launch?.agentId;

  return (
    <button
      type="button"
      disabled={!agentId}
      aria-pressed={isOpen}
      title={agent?.name ?? "Agent"}
      onClick={() =>
        isOpen
          ? agentSidePane.close()
          : openPane(agentSidePane, { convId: conversation.id, agentId: agentId! }, { mode: "push" })
      }
      className={cn(
        "rounded-full transition-opacity",
        isOpen ? "opacity-100 ring-2 ring-ring ring-offset-1 ring-offset-background" : "hover:opacity-80",
        !agentId && "pointer-events-none cursor-default opacity-60",
      )}
    >
      <Avatar
        icon={agent?.icon ?? DEFAULT_AGENT_AVATAR.icon}
        color={agent?.iconColor ?? DEFAULT_AGENT_AVATAR.color}
        size="sm"
        fallbackKey={agent?.id}
      />
    </button>
  );
}
