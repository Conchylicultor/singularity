// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/agents/server/api`.
import type { Agent, AgentLaunch } from "../server/internal/schema";
import type { ConversationStatus } from "@plugins/conversations/shared";

export type { Agent, AgentLaunch } from "../server/internal/schema";

// Launch rows embed a pointer to the most recent conversation bound to their
// taskId so clients can render activity dots and launch links without
// subscribing to the bounded recentConversationsResource (which truncates old
// conversations). `null` when no conversation exists for the task.
export type AgentLaunchConversationRef = {
  id: string;
  title: string | null;
  status: ConversationStatus;
};
export type AgentLaunchWithStatus = AgentLaunch & {
  latestConversationStatus: ConversationStatus | null;
  latestConversation: AgentLaunchConversationRef | null;
};

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const agentsResource = descriptor<Agent[]>("agents");
export const agentLaunchesResource = descriptor<AgentLaunchWithStatus[]>("agent-launches");
