import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const CreateConversationBodySchema = z.object({
  taskId: z.string().optional(),
  attemptId: z.string().optional(),
  prompt: z.string().optional(),
  runtime: z.string().optional(),
  model: z.string().optional(),
  forkFromConversationId: z.string().optional(),
});
export type CreateConversationBody = z.infer<typeof CreateConversationBodySchema>;

export const PostTurnBodySchema = z.object({
  text: z.string().min(1),
});
export type PostTurnBody = z.infer<typeof PostTurnBodySchema>;

// --- Query schemas ---

export const ListGoneQuerySchema = z.object({
  before: z.string(),
  limit: z.string().optional(),
});
export type ListGoneQuery = z.infer<typeof ListGoneQuerySchema>;

export const ListTurnsQuerySchema = z.object({
  since: z.string().optional(),
});
export type ListTurnsQuery = z.infer<typeof ListTurnsQuerySchema>;

export const DeleteConversationQuerySchema = z.object({
  name: z.string(),
});
export type DeleteConversationQuery = z.infer<typeof DeleteConversationQuerySchema>;

// --- Endpoint definitions ---

export const listConversations = defineEndpoint({
  route: "GET /api/conversations",
});

export const listGoneConversations = defineEndpoint({
  route: "GET /api/conversations/gone",
  query: ListGoneQuerySchema,
});

export const getConversation = defineEndpoint({
  route: "GET /api/conversations/:id",
});

export const createConversation = defineEndpoint({
  route: "POST /api/conversations",
  body: CreateConversationBodySchema,
});

export const deleteConversation = defineEndpoint({
  route: "DELETE /api/conversations",
  query: DeleteConversationQuerySchema,
});

export const postConversationTurn = defineEndpoint({
  route: "POST /api/conversations/:id/turn",
  body: PostTurnBodySchema,
});

export const stopConversation = defineEndpoint({
  route: "POST /api/conversations/:id/stop",
});

export const listConversationTurns = defineEndpoint({
  route: "GET /api/conversations/:id/turns",
  query: ListTurnsQuerySchema,
});

export const closeConversation = defineEndpoint({
  route: "POST /api/conversations/:id/close",
});
