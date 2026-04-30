import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";

// One row per conversation. Cascade-deletes with the parent conversation.
// `messageId` is null for push-triggered updates; non-null for Haiku-sourced
// rows where it serves as the idempotency key (same messageId = same turn).
// Phase advances monotonically: haiku-job never regresses below the stored value.
export const _conversationProgress = pgTable("conversation_progress", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => _conversations.id, { onDelete: "cascade" }),
  phase: text("phase", {
    enum: ["research", "plan", "implementation", "pushed"],
  }).notNull(),
  messageId: text("message_id"),
  source: text("source", { enum: ["haiku", "push"] }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
