// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/conversations/plugins/agents/server/api`.
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { liveValue } from "@plugins/network/plugins/live/core";
import { z } from "zod";
import {
  AgentSchema,
  AgentLaunchWithStatusSchema,
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

// The user's agent roster — every row of `agents_v`, ordered by (rank,
// createdAt) — as ONE value, not a collection: the Agents sidebar renders the
// whole tree (parentId + per-parent rank), and every other reader looks one
// agent up in it. It is hand-written, so it grows only by hand; the server
// states that bound (`unbounded: { reason }`). `preload: "boot"`: the boot
// snapshot hydrates it (and, being DB-backed, it is L2-persisted), so the
// sidebar and the conversation avatars paint settled on the first frame.
export const agentRows = liveValue("agents", {
  schema: z.array(AgentSchema),
  preload: "boot",
});

// Keyed delta-sync: mirrors the server resource's `mode: "keyed"` + `keyOf`.
// Must stay in lockstep — a plain `resourceDescriptor` here crashes the client
// the moment the server ships a row-level delta (no keyOf to merge by).
export const agentLaunchesResource = keyedResourceDescriptor<
  AgentLaunchWithStatus[]
>(
  "agent-launches",
  z.array(AgentLaunchWithStatusSchema),
  [],
  (row) => (row as AgentLaunchWithStatus).id,
  { preload: "boot" },
);
