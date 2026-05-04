import { z } from "zod";
import { ConversationStatusSchema } from "@plugins/conversations/shared";
import { RankSchema } from "@plugins/primitives/plugins/rank/shared";

// Pure Zod schemas for agent types — no drizzle imports, safe to use in
// shared/ and web/. The server schema.ts imports from here and wraps with
// createSelectSchema for DB interop.

export const AgentSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  icon: z.string().nullable(),
  iconColor: z.string().nullable(),
  expanded: z.boolean(),
  rank: RankSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  isFolder: z.boolean(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgentLaunchSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  taskId: z.string(),
  createdAt: z.coerce.date(),
});
export type AgentLaunch = z.infer<typeof AgentLaunchSchema>;

const AgentLaunchConversationRefSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: ConversationStatusSchema,
});

export const AgentLaunchWithStatusSchema = AgentLaunchSchema.extend({
  latestConversationStatus: ConversationStatusSchema.nullable(),
  latestConversation: AgentLaunchConversationRefSchema.nullable(),
});
export type AgentLaunchWithStatus = z.infer<typeof AgentLaunchWithStatusSchema>;
