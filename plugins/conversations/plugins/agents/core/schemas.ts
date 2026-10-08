import { z } from "zod";
import { ConversationStatusSchema } from "@plugins/tasks/plugins/tasks-core/core";
import { SavedSymbolNameSchema } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { StoredModelChoiceSchema } from "@plugins/conversations/plugins/model-provider/core";

// Pure Zod schemas for agent types — no drizzle imports, safe to use in
// core/, shared/, and web/. The server schema.ts imports from here and wraps
// with createSelectSchema for DB interop.

export const AgentSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  prompt: z.string().nullable(),
  // A family ("sonnet" — its newest version) or a pinned version; null = default.
  model: StoredModelChoiceSchema.nullable(),
  // A picked Material Symbols name (drawn as a runtime symbol); null = the
  // default avatar.
  icon: SavedSymbolNameSchema.nullable(),
  iconColor: z.string().nullable(),
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

// The latest non-system conversation of a launch's task: what an agent's
// Attempts list links to and colours its dot by.
export const AgentLaunchConversationRefSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: ConversationStatusSchema,
});
export type AgentLaunchConversationRef = z.infer<
  typeof AgentLaunchConversationRefSchema
>;

export const AgentLaunchWithStatusSchema = AgentLaunchSchema.extend({
  latestConversationStatus: ConversationStatusSchema.nullable(),
  latestConversation: AgentLaunchConversationRefSchema.nullable(),
});
export type AgentLaunchWithStatus = z.infer<typeof AgentLaunchWithStatusSchema>;
