import { asc, desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { conversationSummariesResource as conversationSummariesDescriptor } from "../../core";
import type { ConversationSummary } from "../../core";
import { _conversationSummaries } from "./tables";

// The table row type and the `ConversationSummary` wire schema both derive from
// the single `conversationSummaryFields` record (core), so
// `_conversationSummaries.$inferSelect ≡ ConversationSummary` by construction —
// the loader returns `db.select()` rows verbatim (grouped by conversationId)
// with no projection and no `rowToSummary` helper.
export const conversationSummariesResource = defineResource(
  conversationSummariesDescriptor,
  {
    mode: "push",
    loader: async (): Promise<Record<string, ConversationSummary[]>> => {
      const rows = await db
        .select()
        .from(_conversationSummaries)
        .orderBy(
          asc(_conversationSummaries.conversationId),
          desc(_conversationSummaries.generatedAt),
        );
      const out: Record<string, ConversationSummary[]> = {};
      for (const row of rows) {
        const arr = out[row.conversationId] ?? [];
        arr.push(row);
        out[row.conversationId] = arr;
      }
      return out;
    },
  },
);
