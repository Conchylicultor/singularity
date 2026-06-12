import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { AgentSchema, AgentLaunchWithStatusSchema } from "./schemas";

// --- Body schemas ---

export const CreateAgentBodySchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().optional(),
  prompt: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  iconColor: z.string().nullable().optional(),
  iconSvgNodes: z.string().nullable().optional(),
});
export type CreateAgentBody = z.infer<typeof CreateAgentBodySchema>;

export const UpdateAgentBodySchema = z.object({
  name: z.string().optional(),
  prompt: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  iconColor: z.string().nullable().optional(),
  iconSvgNodes: z.string().nullable().optional(),
  expanded: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
  rank: RankSchema.optional(),
});
export type UpdateAgentBody = z.infer<typeof UpdateAgentBodySchema>;

export const LaunchAgentBodySchema = z.object({
  model: z.string().optional(),
});
export type LaunchAgentBody = z.infer<typeof LaunchAgentBodySchema>;

export const LaunchAgentResponseSchema = z.object({
  launchId: z.string(),
  taskId: z.string(),
  conversationId: z.string(),
});
export type LaunchAgentResponse = z.infer<typeof LaunchAgentResponseSchema>;

// --- Endpoint definitions ---

export const listAgents = defineEndpoint({
  route: "GET /api/agents",
  response: z.array(AgentSchema),
});

export const createAgent = defineEndpoint({
  route: "POST /api/agents",
  body: CreateAgentBodySchema,
  response: AgentSchema,
});

export const getAgent = defineEndpoint({
  route: "GET /api/agents/:id",
  response: AgentSchema,
});

export const updateAgent = defineEndpoint({
  route: "PATCH /api/agents/:id",
  body: UpdateAgentBodySchema,
  response: AgentSchema,
});

export const deleteAgent = defineEndpoint({
  route: "DELETE /api/agents/:id",
});

export const launchAgent = defineEndpoint({
  route: "POST /api/agents/:id/launch",
  body: LaunchAgentBodySchema,
  response: LaunchAgentResponseSchema,
});

export const listAgentLaunches = defineEndpoint({
  route: "GET /api/agents/:id/launches",
  response: z.array(AgentLaunchWithStatusSchema),
});
