// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/agents/server/api`.
import type { ConversationStatus } from "@plugins/conversations/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";
import {
  AgentSchema,
  AgentLaunchWithStatusSchema,
  type Agent,
  type AgentLaunchWithStatus,
} from "./schemas";

export type { Agent, AgentLaunch, AgentLaunchWithStatus } from "./schemas";

// Launch rows embed a pointer to the most recent conversation bound to their
// taskId so clients can render activity dots and launch links without
// subscribing to the bounded conversationsResource (which truncates old
// conversations). `null` when no conversation exists for the task.
export type AgentLaunchConversationRef = {
  id: string;
  title: string | null;
  status: ConversationStatus;
};

export const agentsResource = resourceDescriptor<Agent[]>(
  "agents",
  z.array(AgentSchema),
  [],
);
export const agentLaunchesResource = resourceDescriptor<AgentLaunchWithStatus[]>(
  "agent-launches",
  z.array(AgentLaunchWithStatusSchema),
  [],
);
