import { z } from "zod";
import { asc, desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _conversationSummaries } from "./tables";
import {
  ConversationSummarySchema,
} from "../../shared/resources";
import type { Phase } from "../../shared/resources";
import type { ConversationSummary } from "../../shared/resources";

function rowToSummary(
  row: typeof _conversationSummaries.$inferSelect,
): ConversationSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    turnCountAtGeneration: row.turnCountAtGeneration,
    phase: row.phase as Phase,
    phaseDetail: row.phaseDetail,
    flags: row.flags,
    nextAction: row.nextAction,
    notes: row.notes,
  };
}

export const conversationSummariesResource = defineResource({
  key: "conversation-summaries",
  mode: "push",
  schema: z.record(z.array(ConversationSummarySchema)),
  loader: async (): Promise<Record<string, ConversationSummary[]>> => {
    const rows = await db
      .select()
      .from(_conversationSummaries)
      .orderBy(asc(_conversationSummaries.conversationId), desc(_conversationSummaries.generatedAt));
    const out: Record<string, ConversationSummary[]> = {};
    for (const row of rows) {
      const summary = rowToSummary(row);
      const arr = out[summary.conversationId] ?? [];
      arr.push(summary);
      out[summary.conversationId] = arr;
    }
    return out;
  },
});
