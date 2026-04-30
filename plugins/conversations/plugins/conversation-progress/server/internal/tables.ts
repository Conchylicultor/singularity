import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";

export const _conversationProgress = pgTable("conversation_progress", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => _conversations.id, { onDelete: "cascade" }),
  phase: text("phase", {
    enum: ["research", "design", "implementation", "pushed"],
  }).notNull(),
  source: text("source", { enum: ["heuristic", "push"] }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
