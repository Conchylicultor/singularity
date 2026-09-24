import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { conversationSummariesResource as conversationSummariesDescriptor } from "../../core";
import { _conversationSummaries } from "./tables";

// One conversation's summaries (keyed, params `{ conversationId }`,
// identityTable "conversation_summaries"). Hand-written like
// `pushes-by-attempt`: the identityTable scopes recompute, and a summary insert
// is delivered to every subscribed conversation tuple — the scoped refill
// (`WHERE conversation_id = X AND id IN affectedIds`) returns the row only for
// the owning conversation, so other tuples no-op. FULL load = one
// conversation's summaries (bounded by its Summarise presses), latest first,
// served by the `(conversationId, generatedAt)` index.
//
// The table row type and the `ConversationSummary` wire schema both derive from
// the single `conversationSummaryFields` record (core), so
// `_conversationSummaries.$inferSelect ≡ ConversationSummary` by construction —
// the loader returns `db.select()` rows verbatim.
export const conversationSummariesResource = defineResource(
  conversationSummariesDescriptor,
  {
    identityTable: "conversation_summaries",
    fanOut: {
      reason:
        "the params key `conversation_id`, a FOREIGN column — the ids the change feed emits are `conversation_summaries.id`, so a changed id cannot be compared against a tuple's conversationId; the scoped refill (`WHERE conversation_id = X AND id IN affectedIds`) returns the row only for the owning conversation, so what fans out is the call count, not the payload",
    },
    loader: async ({ conversationId }, ctx) =>
      ctx?.affectedIds
        ? db
            .select()
            .from(_conversationSummaries)
            .where(
              and(
                eq(_conversationSummaries.conversationId, conversationId),
                inArray(_conversationSummaries.id, [...ctx.affectedIds]),
              ),
            )
        : db
            .select()
            .from(_conversationSummaries)
            .where(eq(_conversationSummaries.conversationId, conversationId))
            .orderBy(desc(_conversationSummaries.generatedAt)),
  },
);
