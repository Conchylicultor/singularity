import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const ReorderBodySchema = z.object({
  conversationId: z.string().min(1),
  targetId: z.string().min(1),
  zone: z.enum(["before", "after"]),
});

export const reorderQueue = defineEndpoint({
  route: "POST /api/conversations-queue/reorder",
  body: ReorderBodySchema,
  // `watermark` is the commit's ack token (`currentTxId` read inside the write
  // transaction) — the optimistic overlay uses it for causal confirmation. A
  // self-target no-op reorder returns no watermark (nothing was written).
  response: z.object({ watermark: z.string().optional() }),
});

const ConversationIdBodySchema = z.object({
  conversationId: z.string().min(1),
});

export const promoteQueue = defineEndpoint({
  route: "POST /api/conversations-queue/promote",
  body: ConversationIdBodySchema,
});

export const demoteQueue = defineEndpoint({
  route: "POST /api/conversations-queue/demote",
  body: ConversationIdBodySchema,
});

const StepDownBodySchema = z.object({
  conversationId: z.string().min(1),
  steps: z.number().int().positive(),
});

export const stepDownQueue = defineEndpoint({
  route: "POST /api/conversations-queue/step-down",
  body: StepDownBodySchema,
});

export const rerankQueue = defineEndpoint({
  route: "POST /api/conversations-queue/rerank",
  body: ConversationIdBodySchema,
});
