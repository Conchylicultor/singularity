import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";

// One row per conversation — the latest turn-summary, replaced on every
// completed assistant turn. `messageId` is the assistant's message.id from
// the conversationTurnCompleted event payload, used as an idempotency key
// so a re-emitted event for the same turn is a no-op.
export const _turnSummaries = pgTable("turn_summaries", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => _conversations.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  summary: text("summary").notNull(),
  caveats: text("caveats").notNull().default(""),
  actions: text("actions").notNull().default(""),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
