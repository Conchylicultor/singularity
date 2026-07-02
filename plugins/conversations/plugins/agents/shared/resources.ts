// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/conversations/plugins/agents/server/api`.
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";
import {
  keyedResourceDescriptor,
  resourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";
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
// subscribing to the bounded conversations live resources (which truncate old
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
  { bootCritical: true },
);
// Keyed delta-sync: mirrors the server resource's `mode: "keyed"` + `keyOf`.
// Must stay in lockstep — a plain `resourceDescriptor` here crashes the client
// the moment the server ships a row-level delta (no keyOf to merge by).
export const agentLaunchesResource = keyedResourceDescriptor<AgentLaunchWithStatus[]>(
  "agent-launches",
  z.array(AgentLaunchWithStatusSchema),
  [],
  (row) => (row as AgentLaunchWithStatus).id,
  { bootCritical: true },
);
