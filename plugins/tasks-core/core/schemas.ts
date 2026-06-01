import { z } from "zod";
import {
  AttemptSchema,
  ConversationSchema,
  type Conversation,
} from "../server/internal/schema";
import { normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * A stored conversation row may carry a legacy or unknown `model` string —
 * e.g. written by a concurrent worktree server still on pre-flatten code, or a
 * model id later removed from the registry. The strict `ConversationModelSchema`
 * inside `ConversationSchema` would reject it, and because the live resource
 * parses the whole `z.array(...)` atomically, a single bad row rejects the
 * ENTIRE payload — blanking the conversation list and the working/waiting
 * indicators for every conversation.
 *
 * Normalize `model` at the row boundary (before the strict schema runs) so one
 * stray value degrades to a valid concrete model instead of poisoning the list.
 * Output type stays `Conversation` — only the unknown input is absorbed.
 */
// Cast to `ZodType<Conversation>`: the schema genuinely parses to `Conversation`,
// and the cast only hides the `unknown` input that `z.preprocess` introduces, so
// it still satisfies the resource's `input === output` contract.
const StoredConversationSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && "model" in raw) {
    const r = raw as Record<string, unknown>;
    return { ...r, model: normalizeModel(String(r.model)) };
  }
  return raw;
}, ConversationSchema) as z.ZodType<Conversation>;

export const ConversationSummarySchema = ConversationSchema.pick({
  id: true,
  title: true,
  status: true,
  kind: true,
  createdAt: true,
  spawnedBy: true,
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const AttemptWithConversationsSchema = AttemptSchema.extend({
  conversations: z.array(ConversationSummarySchema),
});
export type AttemptWithConversations = z.infer<typeof AttemptWithConversationsSchema>;

const ConversationListPayloadSchema = z.object({
  active: z.array(StoredConversationSchema),
  recentGone: z.array(StoredConversationSchema),
  hasMoreGone: z.boolean(),
  totalGoneCount: z.number(),
  system: z.array(StoredConversationSchema),
});
export type ConversationListPayload = z.infer<typeof ConversationListPayloadSchema>;

export const conversationsResource = resourceDescriptor<ConversationListPayload>(
  "conversations",
  ConversationListPayloadSchema,
  { active: [], recentGone: [], hasMoreGone: false, totalGoneCount: 0, system: [] },
);
