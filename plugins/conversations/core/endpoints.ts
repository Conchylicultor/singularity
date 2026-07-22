import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ConversationSchema } from "@plugins/tasks/plugins/tasks-core/core";
import { EffortLevelSchema } from "@plugins/conversations/plugins/effort-provider/core";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";

// --- Body schemas ---

export const CreateConversationBodySchema = z.object({
  taskId: z.string().optional(),
  attemptId: z.string().optional(),
  prompt: z.string().optional(),
  runtime: z.string().optional(),
  // Strict enum — an unknown/typo model id is rejected loudly at the endpoint
  // boundary (400) rather than silently coerced to DEFAULT_MODEL. This is an
  // *input* schema; stored model fields read back from the DB stay tolerant via
  // StoredModelSchema / normalizeModel.
  model: ConversationModelSchema.optional(),
  forkFromConversationId: z.string().optional(),
  prepromptId: z.string().optional(),
  effort: EffortLevelSchema.optional(),
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
  response: z.array(ConversationSchema),
});

export const listGoneConversations = defineEndpoint({
  route: "GET /api/conversations/gone",
  query: ListGoneQuerySchema,
  response: z.object({
    items: z.array(ConversationSchema),
    hasMore: z.boolean(),
  }),
});

export const getConversation = defineEndpoint({
  route: "GET /api/conversations/:id",
  response: ConversationSchema,
});

export const createConversation = defineEndpoint({
  route: "POST /api/conversations",
  body: CreateConversationBodySchema,
  response: ConversationSchema,
  // Regression backstop: the interactive Launch path must never again block on
  // worktree-scale subprocess work (the `setupWorktree` checkout is now off in a
  // durable job). If this endpoint's in-process time creeps back over 1 s, the
  // slow-ops pipeline files a report — catching any re-introduced blocking work.
  slowThresholdMs: 1000,
});

export const deleteConversation = defineEndpoint({
  route: "DELETE /api/conversations",
  query: DeleteConversationQuerySchema,
});

export const postConversationTurn = defineEndpoint({
  route: "POST /api/conversations/:id/turn",
  body: PostTurnBodySchema,
  // The server's finalText (attachment refs rewritten to @<disk-path>, trimmed).
  // The pending-turn store matches THIS against the transcript — the raw draft
  // never appears verbatim in the session JSONL.
  response: z.object({ resolvedText: z.string() }),
});

export const stopConversation = defineEndpoint({
  route: "POST /api/conversations/:id/stop",
  response: z.object({ ok: z.boolean(), rewindText: z.string().nullable() }),
});

const TurnSchema = z.object({
  at: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  stopReason: z.string().optional(),
  messageId: z.string().optional(),
});

export const listConversationTurns = defineEndpoint({
  route: "GET /api/conversations/:id/turns",
  query: ListTurnsQuerySchema,
  response: z.object({
    turns: z.array(TurnSchema),
  }),
});

export const closeConversation = defineEndpoint({
  route: "POST /api/conversations/:id/close",
});
