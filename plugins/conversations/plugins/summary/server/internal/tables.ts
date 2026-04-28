import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Append-only summary rows — one row per "Summarize" press, never updated.
// Soft FK to conversations (text id, no cascade): the model decides when
// to summarise from outside the conversation lifecycle, and we keep
// historical rows even after a conversation is deleted (sweep later if
// needed). Composite index supports "latest summary for conversation X"
// and "all rows ordered newest-first for monitoring".
export const _conversationSummaries = pgTable(
  "conversation_summaries",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    model: text("model").notNull(),
    turnCountAtGeneration: integer("turn_count_at_generation").notNull(),
    phase: text("phase").notNull(),
    phaseDetail: text("phase_detail"),
    flags: text("flags"),
    nextAction: text("next_action").notNull(),
    notes: text("notes"),
  },
  (t) => [
    index("conversation_summaries_by_conv_idx").on(
      t.conversationId,
      t.generatedAt,
    ),
  ],
);
