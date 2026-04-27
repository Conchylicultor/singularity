// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/agents/server/api`.
import type { Agent, AgentLaunch } from "../server/internal/schema";
import type { ConversationStatus } from "@plugins/conversations/shared";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

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

export const agentsResource = resourceDescriptor<Agent[]>("agents");
export const agentLaunchesResource = resourceDescriptor<AgentLaunchWithStatus[]>("agent-launches");
